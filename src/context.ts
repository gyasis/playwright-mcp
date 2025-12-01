/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import debug from 'debug';
import * as playwright from 'playwright';
import { devices } from 'playwright';

import { callOnPageNoTrace, waitForCompletion } from './tools/utils.js';
import { ManualPromise } from './manualPromise.js';
import { Tab } from './tab.js';
import { outputFile } from './config.js';
import { generateOverlayHTML } from './tools/overlay-template.js';
import type { OverlayPosition } from './config.js';

import type { ImageContent, TextContent } from '@modelcontextprotocol/sdk/types.js';
import type { ModalState, Tool, ToolActionResult } from './tools/tool.js';
import type { FullConfig } from './config.js';
import type { BrowserContextFactory } from './browserContextFactory.js';

type PendingAction = {
  dialogShown: ManualPromise<void>;
};

const testDebug = debug('pw:mcp:test');

export class Context {
  readonly tools: Tool[];
  readonly config: FullConfig;
  private _browserContextPromise: Promise<{ browserContext: playwright.BrowserContext, close: () => Promise<void> }> | undefined;
  private _browserContextFactory: BrowserContextFactory;
  private _tabs: Tab[] = [];
  private _currentTab: Tab | undefined;
  private _modalStates: (ModalState & { tab: Tab })[] = [];
  private _pendingAction: PendingAction | undefined;
  private _downloads: { download: playwright.Download, finished: boolean, outputFile: string }[] = [];
  private _videoRecordingEnabled: boolean = false;
  private _videoRecordingOptions: playwright.BrowserContextOptions['recordVideo'] | undefined;
  clientVersion: { name: string; version: string; } | undefined;

  constructor(tools: Tool[], config: FullConfig, browserContextFactory: BrowserContextFactory) {
    this.tools = tools;
    this.config = config;
    this._browserContextFactory = browserContextFactory;
    testDebug('create context');
  }

  clientSupportsImages(): boolean {
    if (this.config.imageResponses === 'allow')
      return true;
    if (this.config.imageResponses === 'omit')
      return false;
    return !this.clientVersion?.name.includes('cursor');
  }

  modalStates(): ModalState[] {
    return this._modalStates;
  }

  setModalState(modalState: ModalState, inTab: Tab) {
    this._modalStates.push({ ...modalState, tab: inTab });
  }

  clearModalState(modalState: ModalState) {
    this._modalStates = this._modalStates.filter(state => state !== modalState);
  }

  modalStatesMarkdown(): string[] {
    const result: string[] = ['### Modal state'];
    if (this._modalStates.length === 0)
      result.push('- There is no modal state present');
    for (const state of this._modalStates) {
      const tool = this.tools.find(tool => tool.clearsModalState === state.type);
      result.push(`- [${state.description}]: can be handled by the "${tool?.schema.name}" tool`);
    }
    return result;
  }

  tabs(): Tab[] {
    return this._tabs;
  }

  currentTabOrDie(): Tab {
    if (!this._currentTab)
      throw new Error('No current snapshot available. Capture a snapshot or navigate to a new location first.');
    return this._currentTab;
  }

  async newTab(): Promise<Tab> {
    const { browserContext } = await this._ensureBrowserContext();
    const page = await browserContext.newPage();
    this._currentTab = this._tabs.find(t => t.page === page)!;
    return this._currentTab;
  }

  async selectTab(index: number) {
    this._currentTab = this._tabs[index - 1];
    await this._currentTab.page.bringToFront();
  }

  async ensureTab(): Promise<Tab> {
    const { browserContext } = await this._ensureBrowserContext();
    if (!this._currentTab)
      await browserContext.newPage();
    return this._currentTab!;
  }

  async listTabsMarkdown(): Promise<string> {
    if (!this._tabs.length)
      return '### No tabs open';
    const lines: string[] = ['### Open tabs'];
    for (let i = 0; i < this._tabs.length; i++) {
      const tab = this._tabs[i];
      const title = await tab.title();
      const url = tab.page.url();
      const current = tab === this._currentTab ? ' (current)' : '';
      lines.push(`- ${i + 1}:${current} [${title}] (${url})`);
    }
    return lines.join('\n');
  }

  async closeTab(index: number | undefined) {
    const tab = index === undefined ? this._currentTab : this._tabs[index - 1];
    await tab?.page.close();
    return await this.listTabsMarkdown();
  }

  async run(tool: Tool, params: Record<string, unknown> | undefined) {
    // Tab management is done outside of the action() call.
    const toolResult = await tool.handle(this, tool.schema.inputSchema.parse(params || {}));
    const { code, action, waitForNetwork, captureSnapshot, resultOverride } = toolResult;
    const racingAction = action ? () => this._raceAgainstModalDialogs(action) : undefined;

    if (resultOverride)
      return resultOverride;

    if (!this._currentTab) {
      return {
        content: [{
          type: 'text',
          text: 'No open pages available. Use the "browser_navigate" tool to navigate to a page first.',
        }],
      };
    }

    const tab = this.currentTabOrDie();
    // TODO: race against modal dialogs to resolve clicks.
    let actionResult: { content?: (ImageContent | TextContent)[] } | undefined;
    try {
      if (waitForNetwork)
        actionResult = await waitForCompletion(this, tab, async () => racingAction?.()) ?? undefined;
      else
        actionResult = await racingAction?.() ?? undefined;
    } finally {
      if (captureSnapshot && !this._javaScriptBlocked())
        await tab.captureSnapshot();
    }

    const result: string[] = [];
    result.push(`- Ran Playwright code:
\`\`\`js
${code.join('\n')}
\`\`\`
`);

    if (this.modalStates().length) {
      result.push(...this.modalStatesMarkdown());
      return {
        content: [{
          type: 'text',
          text: result.join('\n'),
        }],
      };
    }

    if (this._downloads.length) {
      result.push('', '### Downloads');
      for (const entry of this._downloads) {
        if (entry.finished)
          result.push(`- Downloaded file ${entry.download.suggestedFilename()} to ${entry.outputFile}`);
        else
          result.push(`- Downloading file ${entry.download.suggestedFilename()} ...`);
      }
      result.push('');
    }

    if (this.tabs().length > 1)
      result.push(await this.listTabsMarkdown(), '');

    if (this.tabs().length > 1)
      result.push('### Current tab');

    result.push(
        `- Page URL: ${tab.page.url()}`,
        `- Page Title: ${await tab.title()}`
    );

    if (captureSnapshot && tab.hasSnapshot())
      result.push(tab.snapshotOrDie().text());

    const content = actionResult?.content ?? [];

    return {
      content: [
        ...content,
        {
          type: 'text',
          text: result.join('\n'),
        }
      ],
    };
  }

  async waitForTimeout(time: number) {
    if (!this._currentTab || this._javaScriptBlocked()) {
      await new Promise(f => setTimeout(f, time));
      return;
    }

    await callOnPageNoTrace(this._currentTab.page, page => {
      return page.evaluate(() => new Promise(f => setTimeout(f, 1000)));
    });
  }

  private async _raceAgainstModalDialogs(action: () => Promise<ToolActionResult>): Promise<ToolActionResult> {
    this._pendingAction = {
      dialogShown: new ManualPromise(),
    };

    let result: ToolActionResult | undefined;
    try {
      await Promise.race([
        action().then(r => result = r),
        this._pendingAction.dialogShown,
      ]);
    } finally {
      this._pendingAction = undefined;
    }
    return result;
  }

  private _javaScriptBlocked(): boolean {
    return this._modalStates.some(state => state.type === 'dialog');
  }

  dialogShown(tab: Tab, dialog: playwright.Dialog) {
    this.setModalState({
      type: 'dialog',
      description: `"${dialog.type()}" dialog with message "${dialog.message()}"`,
      dialog,
    }, tab);
    this._pendingAction?.dialogShown.resolve();
  }

  async downloadStarted(tab: Tab, download: playwright.Download) {
    const entry = {
      download,
      finished: false,
      outputFile: await outputFile(this.config, download.suggestedFilename())
    };
    this._downloads.push(entry);
    await download.saveAs(entry.outputFile);
    entry.finished = true;
  }

  private _onPageCreated(page: playwright.Page) {
    const tab = new Tab(this, page, tab => this._onPageClosed(tab));
    this._tabs.push(tab);
    if (!this._currentTab)
      this._currentTab = tab;
  }

  private _onPageClosed(tab: Tab) {
    this._modalStates = this._modalStates.filter(state => state.tab !== tab);
    const index = this._tabs.indexOf(tab);
    if (index === -1)
      return;
    this._tabs.splice(index, 1);

    if (this._currentTab === tab)
      this._currentTab = this._tabs[Math.min(index, this._tabs.length - 1)];
    if (!this._tabs.length)
      void this.close();
  }

  async switchDevice(deviceName: string): Promise<void> {
    testDebug(`switching device to: ${deviceName}`);

    // Validate device name
    const deviceConfig = this._getDeviceConfig(deviceName);
    if (!deviceConfig)
      throw new Error(`Unknown device: ${deviceName}. Use "desktop" or a device from playwright.devices like "iPhone 15", "Pixel 7", etc.`);

    // Save current tab URLs to restore after context recreation
    const currentTabUrls: string[] = [];
    if (this._tabs.length > 0) {
      for (const tab of this._tabs) {
        const url = tab.page.url();
        if (url && url !== 'about:blank')
          currentTabUrls.push(url);
      }
    }

    // Close current browser context
    await this.close();

    // Update config with new device settings
    if (deviceName === 'desktop') {
      // Reset to desktop settings
      this.config.browser.contextOptions = {
        ...this.config.browser.contextOptions,
        viewport: null,
        userAgent: undefined,
        deviceScaleFactor: undefined,
        hasTouch: undefined,
        isMobile: undefined,
      };
    } else {
      // Apply device emulation settings
      this.config.browser.contextOptions = {
        ...this.config.browser.contextOptions,
        ...deviceConfig,
      };
    }

    // Recreate browser context with new device settings
    const { browserContext } = await this._ensureBrowserContext();

    // Restore tabs with saved URLs
    if (currentTabUrls.length > 0) {
      for (const url of currentTabUrls) {
        const page = await browserContext.newPage();
        await page.goto(url);
      }
    } else {
      // Create at least one empty tab if no URLs to restore
      await browserContext.newPage();
    }

    // Resize browser window using CDP for proper mobile/desktop visualization
    if (!this.config.browser.launchOptions?.headless) {
      try {
        const pages = browserContext.pages();
        if (pages.length > 0) {
          const page = pages[0];

          // Calculate window dimensions
          let windowWidth: number;
          let windowHeight: number;

          if (deviceName === 'desktop') {
            // For desktop, use a large comfortable size
            windowWidth = 1280;
            windowHeight = 800;
          } else if (deviceConfig.viewport) {
            // For mobile devices, use device viewport + padding for browser chrome
            const targetViewport = deviceConfig.viewport;
            // Add padding for browser chrome (title bar ~80px, borders ~20px)
            windowWidth = targetViewport.width + 20;
            windowHeight = targetViewport.height + 100;
          } else {
            // Fallback
            windowWidth = 1280;
            windowHeight = 800;
          }

          // Use CDP to resize the actual browser window
          const client = await page.context().newCDPSession(page);
          try {
            // Get the window ID for this target
            const { windowId } = await client.send('Browser.getWindowForTarget');

            // Set window bounds - first set to 'normal' state, then resize
            await client.send('Browser.setWindowBounds', {
              windowId,
              bounds: {
                windowState: 'normal',
              },
            });

            // Now set the actual size
            await client.send('Browser.setWindowBounds', {
              windowId,
              bounds: {
                width: windowWidth,
                height: windowHeight,
              },
            });

            testDebug(`Resized browser window to ${windowWidth}x${windowHeight} for device ${deviceName}`);
          } finally {
            await client.detach();
          }
        }
      } catch (error) {
        testDebug(`Could not resize browser window: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    testDebug(`device switched to: ${deviceName}`);
  }

  private _getDeviceConfig(deviceName: string): playwright.BrowserContextOptions | null {
    if (deviceName === 'desktop')
      return {}; // Desktop is handled specially

    // Check if it's a known Playwright device
    if (deviceName in devices)
      return devices[deviceName as keyof typeof devices];

    // Check for common device aliases
    const deviceAliases: Record<string, string> = {
      'iphone': 'iPhone 13',
      'iphone15': 'iPhone 15',
      'iphone14': 'iPhone 14',
      'iphone13': 'iPhone 13',
      'pixel': 'Pixel 7',
      'pixel7': 'Pixel 7',
      'pixel6': 'Pixel 6',
      'ipad': 'iPad Pro',
      'android': 'Pixel 7',
      'mobile': 'iPhone 13',
    };

    const aliasDevice = deviceAliases[deviceName.toLowerCase()];
    if (aliasDevice && aliasDevice in devices)
      return devices[aliasDevice as keyof typeof devices];

    return null;
  }

  async close() {
    if (!this._browserContextPromise)
      return;

    testDebug('close context');

    const promise = this._browserContextPromise;
    this._browserContextPromise = undefined;

    await promise.then(async ({ browserContext, close }) => {
      if (this.config.saveTrace)
        await browserContext.tracing.stop();
      await close();
    });
  }

  private async _setupRequestInterception(context: playwright.BrowserContext) {
    if (this.config.network?.allowedOrigins?.length) {
      await context.route('**', route => route.abort('blockedbyclient'));

      for (const origin of this.config.network.allowedOrigins)
        await context.route(`*://${origin}/**`, route => route.continue());
    }

    if (this.config.network?.blockedOrigins?.length) {
      for (const origin of this.config.network.blockedOrigins)
        await context.route(`*://${origin}/**`, route => route.abort('blockedbyclient'));
    }
  }

  private _ensureBrowserContext() {
    if (!this._browserContextPromise) {
      this._browserContextPromise = this._setupBrowserContext();
      this._browserContextPromise.catch(() => {
        this._browserContextPromise = undefined;
      });
    }
    return this._browserContextPromise;
  }

  private async _setupBrowserContext(): Promise<{ browserContext: playwright.BrowserContext, close: () => Promise<void> }> {
    // TODO: move to the browser context factory to make it based on isolation mode.

    // Temporarily modify context options if video recording is enabled
    const originalContextOptions = this.config.browser.contextOptions;
    if (this._videoRecordingEnabled && this._videoRecordingOptions) {
      this.config.browser.contextOptions = {
        ...originalContextOptions,
        recordVideo: this._videoRecordingOptions
      };
    }

    const result = await this._browserContextFactory.createContext();

    // Restore original context options
    if (this._videoRecordingEnabled && this._videoRecordingOptions)
      this.config.browser.contextOptions = originalContextOptions;


    const { browserContext } = result;
    await this._setupRequestInterception(browserContext);
    for (const page of browserContext.pages())
      this._onPageCreated(page);
    browserContext.on('page', page => this._onPageCreated(page));
    if (this.config.saveTrace) {
      await browserContext.tracing.start({
        name: 'trace',
        screenshots: false,
        snapshots: true,
        sources: false,
      });
    }
    return result;
  }

  async closeBrowserContext(): Promise<void> {
    if (this._browserContextPromise) {
      const { close } = await this._browserContextPromise;
      await close();
      this._browserContextPromise = undefined;
      this._currentTab = undefined;
      this._tabs = [];
    }
  }

  async startVideoRecording(recordVideoOptions: playwright.BrowserContextOptions['recordVideo']): Promise<void> {
    if (this._videoRecordingEnabled)
      throw new Error('Video recording is already enabled.');

    // Save current page URLs before closing context
    const currentUrls: string[] = [];
    for (const tab of this._tabs) {
      const url = tab.page.url();
      if (url && url !== 'about:blank')
        currentUrls.push(url);
    }

    // Store the video recording options
    this._videoRecordingOptions = recordVideoOptions;
    this._videoRecordingEnabled = true;

    // Close existing browser context
    await this.closeBrowserContext();

    // Immediately recreate browser context with video recording enabled
    const { browserContext } = await this._ensureBrowserContext();

    // Restore tabs with saved URLs, or create an empty tab
    if (currentUrls.length > 0) {
      for (const url of currentUrls) {
        const page = await browserContext.newPage();
        await page.goto(url);
      }
    } else {
      await browserContext.newPage();
    }

    testDebug('Video recording started, browser context recreated');
  }

  async stopVideoRecording(): Promise<string | undefined> {
    if (!this._videoRecordingEnabled)
      throw new Error('Video recording is not enabled.');


    let videoPath: string | undefined;

    if (this._browserContextPromise) {
      const { browserContext } = await this._browserContextPromise;

      // Get video path from one of the pages (if any exist)
      const pages = browserContext.pages();
      if (pages.length > 0) {
        const video = pages[0].video();
        if (video)
          videoPath = await video.path();

      }

      // Close the context to finalize video recording
      await this.closeBrowserContext();
    }

    // Reset video recording state
    this._videoRecordingEnabled = false;
    this._videoRecordingOptions = undefined;

    // Wait a bit for the video file to be written
    await new Promise(resolve => setTimeout(resolve, 1000));

    return videoPath;
  }

  isVideoRecordingEnabled(): boolean {
    return this._videoRecordingEnabled;
  }

  /**
   * Inject recording overlay into a page using addInitScript
   *
   * This method implements the overlay injection strategy from research.md:
   * - Uses page.addInitScript() for persistence across navigations
   * - Overlay HTML/CSS is injected before page content loads
   * - Works in both headed and headless modes (DOM exists in headless)
   *
   * @param page - Page to inject overlay into
   * @param position - Corner position for overlay (default: 'top-right')
   * @param sessionId - Unique session identifier
   */
  async injectRecordingOverlay(
    page: playwright.Page,
    position: OverlayPosition = 'top-right',
    sessionId: string
  ): Promise<void> {
    const overlayScript = generateOverlayHTML(position, sessionId);

    // Use addInitScript for persistence across navigations (per research.md decision)
    await page.addInitScript(overlayScript);

    // If page is already loaded, also execute now to show overlay immediately
    if (page.url() !== 'about:blank') {
      try {
        await page.evaluate(overlayScript);
      } catch (error) {
        // Ignore errors if page is not ready yet - addInitScript will handle it
        testDebug('Failed to inject overlay immediately, will be injected on next load:', error);
      }
    }
  }
}
