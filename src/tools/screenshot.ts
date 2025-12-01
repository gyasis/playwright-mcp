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

import { z } from 'zod';
import { execSync, spawn } from 'child_process';
import os from 'os';
import fs from 'fs';

import { defineTool } from './tool.js';
import * as javascript from '../javascript.js';
import { outputFile } from '../config.js';
import { generateLocator } from './utils.js';

import type * as playwright from 'playwright';

const screenshotSchema = z.object({
  raw: z.boolean().optional().describe('Whether to return without compression (in PNG format). Default is false, which returns a JPEG image.'),
  filename: z.string().optional().describe('File name to save the screenshot to. Defaults to `page-{timestamp}.{png|jpeg}` if not specified.'),
  element: z.string().optional().describe('Human-readable element description used to obtain permission to screenshot the element. If not provided, the screenshot will be taken of viewport. If element is provided, ref must be provided too.'),
  ref: z.string().optional().describe('Exact target element reference from the page snapshot. If not provided, the screenshot will be taken of viewport. If ref is provided, element must be provided too.'),
}).refine(data => {
  return !!data.element === !!data.ref;
}, {
  message: 'Both element and ref must be provided or neither.',
  path: ['ref', 'element']
});

const screenshot = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_take_screenshot',
    title: 'Take a screenshot',
    description: `Take a screenshot of the current page. You can't perform actions based on the screenshot, use browser_snapshot for actions.`,
    inputSchema: screenshotSchema,
    type: 'readOnly',
  },

  handle: async (context, params) => {
    const tab = context.currentTabOrDie();
    const snapshot = tab.snapshotOrDie();
    const fileType = params.raw ? 'png' : 'jpeg';
    const fileName = await outputFile(context.config, params.filename ?? `page-${new Date().toISOString()}.${fileType}`);
    const options: playwright.PageScreenshotOptions = { type: fileType, quality: fileType === 'png' ? undefined : 50, scale: 'css', path: fileName };
    const isElementScreenshot = params.element && params.ref;

    const code = [
      `// Screenshot ${isElementScreenshot ? params.element : 'viewport'} and save it as ${fileName}`,
    ];

    const locator = params.ref ? snapshot.refLocator({ element: params.element || '', ref: params.ref }) : null;

    if (locator)
      code.push(`await page.${await generateLocator(locator)}.screenshot(${javascript.formatObject(options)});`);
    else
      code.push(`await page.screenshot(${javascript.formatObject(options)});`);

    const includeBase64 = context.clientSupportsImages();
    const action = async () => {
      const screenshot = locator ? await locator.screenshot(options) : await tab.page.screenshot(options);
      return {
        content: includeBase64 ? [{
          type: 'image' as 'image',
          data: screenshot.toString('base64'),
          mimeType: fileType === 'png' ? 'image/png' : 'image/jpeg',
        }] : []
      };
    };

    return {
      code,
      action,
      captureSnapshot: true,
      waitForNetwork: false,
    };
  }
});

// Desktop screenshot schema
const desktopScreenshotSchema = z.object({
  delay: z.number().min(0).max(30).optional().describe('Delay in seconds before taking screenshot. Default: 5 seconds. Useful for waiting for browser to fully render.'),
  filename: z.string().optional().describe('File name to save the screenshot to. Defaults to `desktop-{timestamp}.png` if not specified.'),
  sound: z.boolean().optional().describe('Play a shutter sound when screenshot is captured. Default: true. Provides audio feedback that screenshot was taken.'),
});

/**
 * Play a sound notification for screenshot capture
 */
async function playScreenshotSound(platform: string, isWSL: boolean): Promise<void> {
  return new Promise((resolve) => {
    let soundCommand: string[];

    if (platform === 'linux' && isWSL) {
      // WSL - use PowerShell to play Windows system sound
      soundCommand = ['powershell.exe', '-Command', '[System.Media.SystemSounds]::Exclamation.Play()'];
    } else if (platform === 'linux') {
      // Linux - try paplay (PulseAudio) with camera shutter sound, or use speech synthesis
      try {
        execSync('which paplay', { stdio: 'ignore' });
        // Try common screenshot sound locations
        const soundPaths = [
          '/usr/share/sounds/freedesktop/stereo/camera-shutter.oga',
          '/usr/share/sounds/gnome/default/alerts/glass.ogg',
          '/usr/share/sounds/ubuntu/stereo/message.ogg'
        ];
        const existingSound = soundPaths.find(p => fs.existsSync(p));
        if (existingSound) {
          soundCommand = ['paplay', existingSound];
        } else {
          // Fall back to speech
          soundCommand = ['spd-say', '-w', 'Screenshot captured'];
        }
      } catch {
        // Try espeak as fallback
        soundCommand = ['spd-say', '-w', 'Screenshot captured'];
      }
    } else if (platform === 'darwin') {
      // macOS - use afplay with system sound
      soundCommand = ['afplay', '/System/Library/Sounds/Tink.aiff'];
    } else if (platform === 'win32') {
      // Windows - play system sound
      soundCommand = ['powershell', '-Command', '[System.Media.SystemSounds]::Exclamation.Play()'];
    } else {
      resolve();
      return;
    }

    try {
      const [cmd, ...args] = soundCommand;
      const proc = spawn(cmd, args, { stdio: 'ignore', detached: true });
      proc.unref();
      // Don't wait for sound to finish
      setTimeout(resolve, 100);
    } catch {
      resolve();
    }
  });
}

/**
 * Desktop Screenshot Tool
 *
 * Captures the entire computer screen (not just browser viewport).
 * Useful for:
 * - Seeing how the browser window appears on screen
 * - Capturing mobile device emulation with browser chrome
 * - Debugging display/rendering issues
 * - Verifying browser window positioning
 */
const desktopScreenshot = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_screen_capture_desktop',
    title: 'Capture desktop screenshot',
    description: `Capture the entire computer screen (not just browser viewport) with an optional delay timer and audio feedback.

**Use Cases:**
- See how the Playwright browser initially opens
- Capture mobile device emulation with full browser chrome
- Debug display/rendering issues
- Verify browser window size and positioning

**Features:**
- Configurable delay (default: 5 seconds)
- Audio feedback when screenshot is captured (default: enabled)
- Cross-platform support (Linux, macOS, Windows, WSL)

**Requirements by OS:**
- Linux: Requires 'scrot' or 'import' (ImageMagick) to be installed
- macOS: Uses built-in 'screencapture' command
- Windows: Uses PowerShell screenshot capability
- WSL: Uses PowerShell through Windows interop`,
    inputSchema: desktopScreenshotSchema,
    type: 'readOnly',
  },

  handle: async (context, params) => {
    const delay = params.delay ?? 5;
    const playSound = params.sound !== false; // Default: true
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = await outputFile(context.config, params.filename ?? `desktop-${timestamp}.png`);
    const platform = os.platform();

    // Detect WSL (Windows Subsystem for Linux)
    let isWSL = false;
    if (platform === 'linux') {
      try {
        const release = fs.readFileSync('/proc/version', 'utf8').toLowerCase();
        isWSL = release.includes('microsoft') || release.includes('wsl');
      } catch {
        // Not WSL or can't detect
      }
    }

    // Determine screenshot command based on OS
    let screenshotCommand: string[];
    let toolName: string;

    if (platform === 'linux' && isWSL) {
      // WSL - use PowerShell through Windows interop
      // Convert Linux path to Windows path for saving
      const winPath = fileName.replace(/^\/mnt\/([a-z])\//, '$1:\\\\').replace(/\//g, '\\\\');
      const psScript = `
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        $screen = [System.Windows.Forms.Screen]::PrimaryScreen
        $bitmap = New-Object System.Drawing.Bitmap($screen.Bounds.Width, $screen.Bounds.Height)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.CopyFromScreen($screen.Bounds.Location, [System.Drawing.Point]::Empty, $screen.Bounds.Size)
        $bitmap.Save('${winPath}')
        $graphics.Dispose()
        $bitmap.Dispose()
      `.replace(/\n/g, ' ');
      screenshotCommand = ['powershell.exe', '-Command', psScript];
      toolName = 'PowerShell (WSL)';
    } else if (platform === 'linux') {
      // Native Linux - try scrot first, fall back to import (ImageMagick)
      try {
        execSync('which scrot', { stdio: 'ignore' });
        screenshotCommand = ['scrot', fileName];
        toolName = 'scrot';
      } catch {
        try {
          execSync('which import', { stdio: 'ignore' });
          screenshotCommand = ['import', '-window', 'root', fileName];
          toolName = 'import (ImageMagick)';
        } catch {
          return {
            code: [`// Desktop screenshot requires "scrot" or "import" to be installed`],
            captureSnapshot: false,
            waitForNetwork: false,
            resultOverride: {
              content: [{
                type: 'text' as const,
                text: 'Desktop screenshot requires "scrot" or "import" (ImageMagick) to be installed on Linux.\nInstall with: sudo apt install scrot'
              }]
            }
          };
        }
      }
    } else if (platform === 'darwin') {
      // macOS - use built-in screencapture
      screenshotCommand = ['screencapture', '-x', fileName];
      toolName = 'screencapture';
    } else if (platform === 'win32') {
      // Windows - use PowerShell
      const psScript = `
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        $screen = [System.Windows.Forms.Screen]::PrimaryScreen
        $bitmap = New-Object System.Drawing.Bitmap($screen.Bounds.Width, $screen.Bounds.Height)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.CopyFromScreen($screen.Bounds.Location, [System.Drawing.Point]::Empty, $screen.Bounds.Size)
        $bitmap.Save('${fileName.replace(/\\/g, '\\\\')}')
        $graphics.Dispose()
        $bitmap.Dispose()
      `.replace(/\n/g, ' ');
      screenshotCommand = ['powershell', '-Command', psScript];
      toolName = 'PowerShell';
    } else {
      return {
        code: [`// Desktop screenshot not supported on platform: ${platform}`],
        captureSnapshot: false,
        waitForNetwork: false,
        resultOverride: {
          content: [{
            type: 'text' as const,
            text: `Desktop screenshot not supported on platform: ${platform}`
          }]
        }
      };
    }

    const code = [
      `// Capture desktop screenshot after ${delay} second delay`,
      `// Platform: ${platform}${isWSL ? ' (WSL)' : ''}, Tool: ${toolName}`,
      `// Output: ${fileName}`,
      `await new Promise(resolve => setTimeout(resolve, ${delay * 1000}));`,
      `exec('${screenshotCommand[0]} ...');`
    ];

    // Execute screenshot directly and return via resultOverride (bypasses page requirement)
    // Wait for the specified delay
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay * 1000));
    }

    // Execute screenshot command
    const result = await new Promise<{ content: ({ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string })[] }>((resolve, reject) => {
      const [cmd, ...args] = screenshotCommand;
      const proc = spawn(cmd, args, { shell: platform === 'win32' || isWSL });

      let stderr = '';
      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', async (exitCode) => {
        if (exitCode === 0 && fs.existsSync(fileName)) {
          // Play sound feedback
          if (playSound) {
            await playScreenshotSound(platform, isWSL);
          }

          const stats = await fs.promises.stat(fileName);
          const includeBase64 = context.clientSupportsImages();

          const content: ({ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string })[] = [{
            type: 'text' as const,
            text: [
              `Desktop screenshot captured successfully!`,
              ``,
              `File: ${fileName}`,
              `Size: ${Math.round(stats.size / 1024)} KB`,
              `Delay: ${delay} seconds`,
              `Sound: ${playSound ? 'enabled' : 'disabled'}`,
              `Platform: ${platform}${isWSL ? ' (WSL)' : ''}`,
              `Tool: ${toolName}`
            ].join('\n')
          }];

          // Include base64 image if client supports it
          if (includeBase64) {
            const imageData = await fs.promises.readFile(fileName);
            content.push({
              type: 'image' as const,
              data: imageData.toString('base64'),
              mimeType: 'image/png'
            });
          }

          resolve({ content });
        } else {
          reject(new Error(`Screenshot failed with code ${exitCode}. ${stderr ? `Error: ${stderr}` : ''}`));
        }
      });

      proc.on('error', (error) => {
        reject(new Error(`Failed to execute ${toolName}: ${error.message}`));
      });
    });

    return {
      code,
      captureSnapshot: false,
      waitForNetwork: false,
      resultOverride: result,
    };
  }
});

export default [
  screenshot,
  desktopScreenshot,
];
