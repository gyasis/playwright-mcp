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
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import crypto from 'crypto';
import debug from 'debug';

import { defineTool } from './tool.js';
import { outputFile } from '../config.js';
import type { OverlayPosition } from '../config.js';
import type { RecordingState } from './overlay-template.js';

import type * as playwright from 'playwright';

// Video recording constants
/**
 * Maximum recording duration in milliseconds (7 minutes)
 * Prevents runaway recordings that consume disk space
 */
const MAX_RECORDING_DURATION_MS = 7 * 60 * 1000; // 7 minutes

/**
 * Default FPS for video conversion output.
 * 15 FPS is sufficient for most automation demos and reduces file size.
 * Playwright records at its native FPS (~25), conversion adjusts final output.
 */
const DEFAULT_FPS = 15;

/**
 * Smooth video FPS for animations.
 * 30 FPS provides smoother playback for content with animations, transitions,
 * or rapid visual changes that need to be captured clearly.
 */
const SMOOTH_FPS = 30;

/**
 * Default video resolution for recordings.
 * 800x600 provides a good balance between quality and file size.
 */
const DEFAULT_VIDEO_SIZE = { width: 800, height: 600 };

// Schemas for remaining tools after consolidation

const videoConvertSchema = z.object({
  inputPath: z.string().describe('Path to the source video file'),
  outputPath: z.string().describe('Path for the converted video file'),
  format: z.enum(['mp4', 'webm', 'gif']).describe('Target format for conversion'),
  quality: z.enum(['low', 'medium', 'high']).optional().describe('Quality preset for conversion'),
  fps: z.number().min(1).max(60).optional().describe(`Output frame rate. Default: ${DEFAULT_FPS} fps (efficient for automation demos). Use ${SMOOTH_FPS} fps for content with animations or transitions.`),
  smooth: z.boolean().optional().describe(`When true, uses ${SMOOTH_FPS} fps for smoother animation playback. When false or omitted, uses ${DEFAULT_FPS} fps for smaller file size. Overrides 'fps' parameter if set.`)
});

/**
 * Generate a new unique session ID for recording
 * Uses crypto.randomUUID() per data-model.md
 */
function generateSessionId(): string {
  return crypto.randomUUID();
}

/**
 * Validate state machine transition per data-model.md
 *
 * Valid transitions:
 * - idle → recording (on "record" action)
 * - recording → stopped (on "stop" or "pause" action)
 * - recording → recording (on "record" action - auto-stops and restarts)
 * - stopped → recording (on "resume" action - starts new recording)
 * - stopped → stopped (on "stop" action - idempotent, no error)
 *
 * Invalid transitions (throw error):
 * - idle → stopped (cannot stop before starting)
 * - Any transition if overlay not enabled
 *
 * @param currentState - Current recording state
 * @param targetState - Desired next state
 * @param action - Action triggering the transition
 * @throws Error if transition is invalid
 */
function validateStateTransition(
  currentState: RecordingState,
  targetState: RecordingState,
  action: 'record' | 'pause' | 'resume' | 'stop'
): void {
  // Validation Rule: Overlay Required
  if (!videoRecordingState.overlayEnabled)
    throw new Error('Overlay must be enabled before recording');


  // "record" action now auto-stops existing recording, so allow from any state
  if (action === 'record') {
    // Allow from any state - we'll auto-stop if needed
    return;
  }

  // "stop" is idempotent - if already stopped, that's OK
  if (action === 'stop' && currentState === 'stopped') {
    // Already stopped, this is OK
    return;
  }

  // Define valid transitions
  const validTransitions: Record<RecordingState, RecordingState[]> = {
    idle: ['recording'],
    recording: ['stopped', 'recording'], // Allow recording -> recording for auto-restart
    stopped: ['recording'], // Resume starts new recording
  };

  // Check if transition is valid
  if (!validTransitions[currentState].includes(targetState))
    throw new Error(`Invalid state transition: ${currentState} → ${targetState}`);


  if ((action === 'stop' || action === 'pause') && currentState !== 'recording')
    throw new Error('No active recording to stop/pause');


  if (action === 'resume' && currentState !== 'stopped')
    throw new Error('Can only resume from stopped state');

}

// Global video recording state
// Extended for overlay recording controls (Feature 001)
const videoRecordingState: {
  // Existing fields (from original implementation)
  isRecording: boolean;
  startTime?: Date;
  filename?: string;
  config?: any;
  videoPath?: string;
  browserContext?: playwright.BrowserContext;

  // NEW: Overlay recording control fields
  overlayEnabled: boolean;
  overlayPosition: OverlayPosition;
  overlayState: RecordingState;
  sessionId: string | null;
  stopTime?: Date;

  // Recording timeout for max duration enforcement
  recordingTimeout?: ReturnType<typeof setTimeout>;
  // Context reference for auto-stop
  contextRef?: any;
} = {
  isRecording: false,
  overlayEnabled: false,
  overlayPosition: 'top-right',
  overlayState: 'idle',
  sessionId: null
};

/**
 * Helper to stop recording and clean up state
 * Used by both manual stop and auto-timeout stop
 */
async function stopRecordingInternal(context: any, reason: string): Promise<string | undefined> {
  // Clear the timeout if it exists
  if (videoRecordingState.recordingTimeout) {
    clearTimeout(videoRecordingState.recordingTimeout);
    videoRecordingState.recordingTimeout = undefined;
  }

  let videoPath: string | undefined;

  if (videoRecordingState.isRecording) {
    try {
      const stopResult = await context.stopVideoRecording();
      if (stopResult)
        videoPath = stopResult;

    } catch (error) {
      // Recording may already be stopped
      const debugError = debug('pw:mcp:video');
      debugError(`Stop recording (${reason}) encountered error:`, error);
    }

    const stopTime = new Date();

    // Update state
    videoRecordingState.isRecording = false;
    videoRecordingState.overlayState = 'stopped';
    videoRecordingState.stopTime = stopTime;

    // Update overlay visual state if we have a page
    try {
      const currentTab = context.currentTab?.();
      if (currentTab?.page)
        await updateOverlayState(currentTab.page, 'stopped');

    } catch (error) {
      // Page may be closed, non-fatal
    }
  }

  return videoPath;
}

/**
 * Start the recording timeout timer (7-minute max)
 */
function startRecordingTimeout(context: any): void {
  // Clear any existing timeout
  if (videoRecordingState.recordingTimeout)
    clearTimeout(videoRecordingState.recordingTimeout);


  // Store context reference for auto-stop
  videoRecordingState.contextRef = context;

  // Set the timeout
  videoRecordingState.recordingTimeout = setTimeout(async () => {
    const debugLog = debug('pw:mcp:video');
    debugLog('Recording timeout reached (7 minutes). Auto-stopping recording.');

    if (videoRecordingState.contextRef)
      await stopRecordingInternal(videoRecordingState.contextRef, 'max duration reached');

  }, MAX_RECORDING_DURATION_MS);
}

// Legacy tools (videoStart, videoStop, videoGetStatus, videoConfigure) removed in consolidation
// Use browser_video_overlay_enable and browser_video_overlay_control instead

const videoConvert = defineTool({
  capability: 'video',
  schema: {
    name: 'browser_video_convert',
    title: 'Convert video format',
    description: `Convert video files between different formats (MP4, WebM, GIF). Requires FFmpeg to be installed.

**FPS Control:**
- Default: ${DEFAULT_FPS} fps - Efficient for automation demos and most use cases
- Smooth: ${SMOOTH_FPS} fps - Better for animations, transitions, and rapid visual changes
- Custom: 1-60 fps range supported via 'fps' parameter

**Recommended Workflow:**
1. Record with browser_video_overlay_enable (Playwright captures at native ~25 fps)
2. Convert with browser_video_convert to optimize FPS and format
3. Use 'smooth: true' only when recording animations or transitions

**Format Notes:**
- WebM: Native Playwright format, good quality, may need conversion for some platforms
- MP4: Universal compatibility, recommended for sharing (Google Gemini, social media)
- GIF: For short clips only, no audio, larger file sizes`,
    inputSchema: videoConvertSchema,
    type: 'destructive',
  },

  handle: async (_context, params) => {
    const inputExists = fs.existsSync(params.inputPath);
    if (!inputExists)
      throw new Error(`Input video file not found: ${params.inputPath}`);

    const outputPath = params.outputPath;
    const format = params.format;

    // Determine target FPS: smooth overrides fps, otherwise use fps or default
    const targetFps = params.smooth ? SMOOTH_FPS : (params.fps ?? DEFAULT_FPS);

    // FFmpeg command construction
    const ffmpegOptions: string[] = [];

    // Add FPS filter
    ffmpegOptions.push('-r', String(targetFps));

    // Add quality settings
    switch (params.quality) {
      case 'low':
        ffmpegOptions.push(...(format === 'mp4' ? ['-crf', '28'] : ['-b:v', '500k']));
        break;
      case 'medium':
        ffmpegOptions.push(...(format === 'mp4' ? ['-crf', '23'] : ['-b:v', '1M']));
        break;
      case 'high':
        ffmpegOptions.push(...(format === 'mp4' ? ['-crf', '18'] : ['-b:v', '2M']));
        break;
      default:
        ffmpegOptions.push(...(format === 'mp4' ? ['-crf', '23'] : ['-b:v', '1M']));
    }

    const ffmpegArgs = [
      '-i', params.inputPath,
      ...ffmpegOptions,
      '-y',
      outputPath
    ];

    const code = [
      `// Convert video from ${path.extname(params.inputPath)} to ${format}`,
      `// FFmpeg command: ffmpeg ${ffmpegArgs.join(' ')}`,
      `const ffmpeg = spawn('ffmpeg', ${JSON.stringify(ffmpegArgs)});`
    ];

    const action = async () => {
      // Check FFmpeg availability
      const ffmpegCommand = 'ffmpeg';

      return new Promise<{ content: { type: 'text'; text: string; }[] }>((resolve, reject) => {
        const ffmpeg = spawn(ffmpegCommand, ffmpegArgs);

        let stderr = '';
        ffmpeg.stderr.on('data', data => {
          stderr += data.toString();
        });

        ffmpeg.on('close', async code => {
          if (code === 0) {
            // Success - check output file
            const outputExists = fs.existsSync(outputPath);
            if (outputExists) {
              const stats = await fs.promises.stat(outputPath);
              resolve({
                content: [{
                  type: 'text' as const,
                  text: [
                    `Video conversion completed successfully!`,
                    ``,
                    `Input: ${params.inputPath}`,
                    `Output: ${outputPath}`,
                    `Format: ${format}`,
                    `Quality: ${params.quality || 'medium'}`,
                    `FPS: ${targetFps} (${params.smooth ? 'smooth mode' : 'standard'})`,
                    `Output file size: ${Math.round(stats.size / 1024)}KB`
                  ].join('\n')
                }]
              });
            } else {
              reject(new Error(`FFmpeg completed but output file not found: ${outputPath}`));
            }
          } else {
            reject(new Error(`FFmpeg failed with code ${code}. Error: ${stderr}`));
          }
        });

        ffmpeg.on('error', error => {
          if (error.message.includes('ENOENT'))
            reject(new Error('FFmpeg not found. Please install FFmpeg to use video conversion.'));
          else
            reject(new Error(`FFmpeg error: ${error.message}`));

        });
      });
    };

    return {
      code,
      action,
      captureSnapshot: false,
      waitForNetwork: false
    };
  }
});

const videoSave = defineTool({
  capability: 'video',
  schema: {
    name: 'browser_video_save',
    title: 'Save video recording',
    description: `Save current or completed video recording to a specific location with custom naming.

**Usage:**
1. Record video using browser_video_overlay_enable/control
2. Stop recording to finalize the video
3. Call browser_video_save to copy to custom location

**Notes:**
- Native format is WebM (VP8 codec)
- Use browser_video_convert for MP4 or to adjust FPS
- Video specs: ${DEFAULT_VIDEO_SIZE.width}x${DEFAULT_VIDEO_SIZE.height}, ~25 fps`,
    inputSchema: z.object({
      filename: z.string().describe('Filename for the saved video'),
      format: z.enum(['webm', 'mp4']).optional().describe('Video format (webm is native Playwright format)')
    }),
    type: 'destructive',
  },

  handle: async (context, params) => {
    if (!videoRecordingState.filename && !videoRecordingState.videoPath)
      throw new Error('No video recording available to save. Start and stop a recording first.');

    const outputPath = await outputFile(context.config, params.filename);
    const format = params.format || 'webm';
    const sourcePath = videoRecordingState.videoPath || videoRecordingState.filename!;

    const action = async () => {
      // Check if source video exists
      if (!fs.existsSync(sourcePath))
        throw new Error(`Source video file not found: ${sourcePath}`);

      // Copy the video file to the new location
      await fs.promises.copyFile(sourcePath, outputPath);

      const stats = await fs.promises.stat(outputPath);

      return {
        content: [{
          type: 'text' as const,
          text: `Video saved successfully!\nSource: ${sourcePath}\nDestination: ${outputPath}\nFormat: ${format}\nFile size: ${Math.round(stats.size / 1024)}KB`
        }]
      };
    };

    const code = [
      `// Save video recording from ${sourcePath}`,
      `await fs.promises.copyFile('${sourcePath}', '${outputPath}');`
    ];

    return {
      code,
      action,
      captureSnapshot: false,
      waitForNetwork: false
    };
  }
});

// Placeholder effect tools (videoAddAnnotation, videoAddHighlight, videoAddCursorTracking) removed in consolidation
// These tools only generated FFmpeg commands without actual functionality

/**
 * Update overlay visual state in the browser
 *
 * This function implements the backend→overlay communication pattern from research.md:
 * - Uses page.evaluate() for direct DOM manipulation
 * - Synchronous execution ensures state changes happen immediately
 * - Updates overlay visual state to match recording state
 *
 * @param page - Page with overlay injected
 * @param state - New recording state
 * @param elapsedTime - Elapsed recording time in seconds (optional)
 */
export async function updateOverlayState(
  page: playwright.Page,
  state: RecordingState,
  elapsedTime?: number
): Promise<void> {
  const { generateUpdateStateScript } = await import('./overlay-template.js');
  const updateScript = generateUpdateStateScript(state, elapsedTime);

  try {
    await page.evaluate(updateScript);
  } catch (error) {
    // Overlay may not be injected yet or page may be closed - this is non-fatal
    const debugError = debug('pw:mcp:overlay');
    debugError('Failed to update overlay state:', error);
  }
}

// T012: Browser overlay enable tool (User Story 1 - MVP)
const videoOverlayEnableSchema = z.object({
  position: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']).optional().describe('Overlay position on browser window. Default \'top-right\' minimizes interference with page content and browser UI.'),
  autoStart: z.boolean().optional().describe('Automatically start recording when overlay is enabled. If true, recording begins immediately without requiring explicit browser_video_overlay_control call.')
});

const videoOverlayEnable = defineTool({
  capability: 'video',
  schema: {
    name: 'browser_video_overlay_enable',
    title: 'Enable recording overlay controls',
    description: `Enable recording overlay controls for current browser session. Shows record/pause/stop buttons that can be triggered via MCP tools. Overlay persists across page navigations and provides visual feedback of recording state to users and LLMs.

**Recording Specifications:**
- Format: WebM (VP8 codec) - native Playwright format
- Resolution: ${DEFAULT_VIDEO_SIZE.width}x${DEFAULT_VIDEO_SIZE.height} pixels
- FPS: ~25 fps (Playwright native capture rate)
- Compatible with: Google Gemini, most video platforms

**Workflow:**
1. Call browser_video_overlay_enable to activate overlay
2. Use autoStart=true for immediate recording, or control manually
3. Use browser_video_overlay_control for pause/resume/stop
4. Check browser_video_status for recording info and video path
5. Optional: Use browser_video_convert to change format/FPS

**Note:** Use browser_video_convert to adjust FPS (15 fps default, 30 fps for smooth animations) after recording.`,
    inputSchema: videoOverlayEnableSchema,
    type: 'destructive',
  },

  handle: async (context, params) => {
    // T016: Error handling for OVERLAY_ALREADY_ENABLED
    if (videoRecordingState.overlayEnabled)
      throw new Error('OVERLAY_ALREADY_ENABLED: Recording overlay is already enabled for this session. Call browser_video_overlay_control to manage existing overlay, or close browser context and create new session.');


    // T016: Error handling for CONTEXT_CLOSED
    // Ensure a tab exists (creates browser context if needed)
    try {
      await context.ensureTab();
    } catch (error) {
      throw new Error('CONTEXT_CLOSED: Browser context is closed, cannot enable overlay. Create new browser context before enabling overlay.');
    }

    const position: OverlayPosition = params.position || 'top-right';
    const autoStart = params.autoStart || false;

    // T007: Generate session ID
    const sessionId = generateSessionId();

    // T004: Update global state with overlay fields
    videoRecordingState.overlayEnabled = true;
    videoRecordingState.overlayPosition = position;
    videoRecordingState.overlayState = 'idle';
    videoRecordingState.sessionId = sessionId;

    // T014: Integrate overlay with browser context creation
    // Inject overlay into all current and future pages
    const currentTab = context.currentTabOrDie();
    const browserContext = currentTab.page.context();

    // T005: Inject overlay using Context method (implemented in context.ts)
    await context.injectRecordingOverlay(currentTab.page, position, sessionId);

    // Set up overlay injection for future pages
    browserContext.on('page', async page => {
      await context.injectRecordingOverlay(page, position, sessionId);
    });

    let recordingStarted = false;

    // T015: Auto-start logic
    if (autoStart) {
      // AUTO-STOP: If somehow already recording, stop first
      if (videoRecordingState.isRecording) {
        const debugLog = debug('pw:mcp:video');
        debugLog('Auto-stopping existing recording before autoStart');
        await stopRecordingInternal(context, 'auto-stop for autoStart');
        videoRecordingState.overlayState = 'idle';
      }

      // Start video recording using existing video infrastructure
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `overlay-recording-${timestamp}.webm`;
      const videoPath = await outputFile(context.config, filename);
      const videoDir = path.dirname(videoPath);

      // Ensure video directory exists
      await fs.promises.mkdir(videoDir, { recursive: true });

      const recordVideoOptions: playwright.BrowserContextOptions['recordVideo'] = {
        dir: videoDir,
        size: DEFAULT_VIDEO_SIZE
      };

      // Start video recording (Playwright captures at native ~25 fps)
      // NOTE: This recreates the browser context, so we need fresh references after
      await context.startVideoRecording(recordVideoOptions);

      // Get fresh references after browser context recreation
      const freshTab = context.currentTabOrDie();
      const freshBrowserContext = freshTab.page.context();

      // Re-inject overlay into the fresh page since context was recreated
      await context.injectRecordingOverlay(freshTab.page, position, sessionId);

      // Set up overlay injection for future pages on the new context
      freshBrowserContext.on('page', async page => {
        await context.injectRecordingOverlay(page, position, sessionId);
      });

      // Update state to recording
      videoRecordingState.isRecording = true;
      videoRecordingState.startTime = new Date();
      videoRecordingState.filename = filename;
      videoRecordingState.videoPath = videoPath;
      videoRecordingState.browserContext = freshBrowserContext;
      videoRecordingState.overlayState = 'recording';

      // Start 7-minute recording timeout
      startRecordingTimeout(context);

      // T006: Update overlay visual state using fresh page reference
      await updateOverlayState(freshTab.page, 'recording');

      recordingStarted = true;
    }

    const code = [
      `// Enable recording overlay controls`,
      `const overlayConfig = {`,
      `  position: '${position}',`,
      `  sessionId: '${sessionId}',`,
      `  autoStart: ${autoStart}`,
      `};`,
      autoStart ? `// Recording auto-started` : `// Overlay enabled (recording not started)`
    ];

    return {
      code,
      captureSnapshot: false,
      waitForNetwork: false,
      resultOverride: {
        content: [{
          type: 'text' as const,
          text: [
            `Recording overlay enabled successfully:`,
            ``,
            `Session ID: ${sessionId}`,
            `Position: ${position}`,
            `Recording auto-started: ${recordingStarted}`,
            ``,
            recordingStarted
              ? `Recording is now active. Use browser_video_overlay_control to pause/stop.`
              : `Overlay ready. Use browser_video_overlay_control to start recording.`
          ].join('\n')
        }]
      }
    };
  }
});

// T022: Browser overlay control tool (User Story 2 - Manual Control)
const videoOverlayControlSchema = z.object({
  action: z.enum(['record', 'pause', 'resume', 'stop']).describe('Recording control action to execute. \'record\' starts recording, \'pause\' stops current recording, \'resume\' starts new recording, \'stop\' finalizes and saves video.')
});

const videoOverlayControl = defineTool({
  capability: 'video',
  schema: {
    name: 'browser_video_overlay_control',
    title: 'Control recording via overlay',
    description: `Control recording via overlay buttons (record/pause/resume/stop). Triggers recording state changes and updates overlay visual state.

**Actions:**
- 'record': Start new recording (from idle state)
- 'pause': Stop current recording and save video (Playwright limitation: true pause not supported)
- 'resume': Start new recording (creates new video file)
- 'stop': Finalize recording and save video

**State Machine:**
- idle → recording (on 'record')
- recording → stopped (on 'pause' or 'stop')
- stopped → recording (on 'resume' - new video file)

**Important:** Each pause/resume cycle creates a new video file. Use browser_video_status to get the video path after stopping.`,
    inputSchema: videoOverlayControlSchema,
    type: 'destructive',
  },

  handle: async (context, params) => {
    const { action } = params;

    // T029: Error handling - OVERLAY_NOT_ENABLED
    if (!videoRecordingState.overlayEnabled)
      throw new Error('OVERLAY_NOT_ENABLED: Recording overlay is not enabled. Call browser_video_overlay_enable before attempting to control recording.');


    const previousState = videoRecordingState.overlayState;
    const currentTab = context.currentTabOrDie();
    let videoPath: string | null = null;
    let duration: number | null = null;
    let message = '';

    // T028: Validate state transition BEFORE executing action
    let targetState: RecordingState;
    switch (action) {
      case 'record':
        targetState = 'recording';
        break;
      case 'pause':
      case 'stop':
        targetState = 'stopped';
        break;
      case 'resume':
        targetState = 'recording';
        break;
    }

    // Use validateStateTransition function from T008
    try {
      validateStateTransition(previousState, targetState, action);
    } catch (error) {
      // T029: Error handling - INVALID_STATE_TRANSITION, RECORDING_ALREADY_ACTIVE, NO_ACTIVE_RECORDING
      throw error; // Re-throw with original error message
    }

    // Execute action handlers

    // T023: Implement "record" action handler
    if (action === 'record') {
      // AUTO-STOP: If already recording, stop first before starting new
      if (videoRecordingState.isRecording) {
        const debugLog = debug('pw:mcp:video');
        debugLog('Auto-stopping existing recording before starting new one');
        await stopRecordingInternal(context, 'auto-stop for new recording');
        // Reset state to allow new recording
        videoRecordingState.overlayState = 'idle';
      }

      // Start video recording using existing infrastructure
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `overlay-recording-${timestamp}.webm`;
      const videoFilePath = await outputFile(context.config, filename);
      const videoDir = path.dirname(videoFilePath);

      await fs.promises.mkdir(videoDir, { recursive: true });

      const recordVideoOptions: playwright.BrowserContextOptions['recordVideo'] = {
        dir: videoDir,
        size: DEFAULT_VIDEO_SIZE
      };

      // Start video recording (Playwright captures at native ~25 fps)
      // NOTE: This recreates the browser context, so we need fresh references after
      await context.startVideoRecording(recordVideoOptions);

      // Get fresh references after browser context recreation
      const freshTab = context.currentTabOrDie();
      const freshBrowserContext = freshTab.page.context();

      // Re-inject overlay into the fresh page since context was recreated
      const position = videoRecordingState.overlayPosition;
      const sessionId = videoRecordingState.sessionId!;
      await context.injectRecordingOverlay(freshTab.page, position, sessionId);

      // Set up overlay injection for future pages on the new context
      freshBrowserContext.on('page', async page => {
        await context.injectRecordingOverlay(page, position, sessionId);
      });

      // Update state
      videoRecordingState.isRecording = true;
      videoRecordingState.startTime = new Date();
      videoRecordingState.filename = filename;
      videoRecordingState.videoPath = videoFilePath;
      videoRecordingState.browserContext = freshBrowserContext;
      videoRecordingState.overlayState = 'recording';

      // Start 7-minute recording timeout
      startRecordingTimeout(context);

      // T027: Update overlay visual state using fresh page reference
      await updateOverlayState(freshTab.page, 'recording');

      message = 'Recording started successfully (max duration: 7 minutes)';
    } else if (action === 'pause') {
    // T024: Implement "pause" action handler
    // Per research.md: "pause" stops current recording and saves video
      // Clear the recording timeout
      if (videoRecordingState.recordingTimeout) {
        clearTimeout(videoRecordingState.recordingTimeout);
        videoRecordingState.recordingTimeout = undefined;
      }

      // Stop the current recording
      const stopResult = await context.stopVideoRecording();

      if (stopResult && videoRecordingState.startTime) {
        videoPath = stopResult;
        const stopTime = new Date();
        duration = (stopTime.getTime() - videoRecordingState.startTime.getTime()) / 1000;

        // Update state
        videoRecordingState.isRecording = false;
        videoRecordingState.overlayState = 'stopped';
        videoRecordingState.stopTime = stopTime;

        // T027: Update overlay visual state
        await updateOverlayState(currentTab.page, 'stopped');

        message = `Recording paused (stopped). Video saved to ${videoPath}. Resume will start new recording.`;
      } else {
        throw new Error('Failed to stop recording during pause action');
      }
    } else if (action === 'resume') {
    // T025: Implement "resume" action handler
    // Per research.md: "resume" starts NEW recording (new video file)
      // Start NEW recording (same as record action, but from stopped state)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `overlay-recording-${timestamp}.webm`;
      const videoFilePath = await outputFile(context.config, filename);
      const videoDir = path.dirname(videoFilePath);

      await fs.promises.mkdir(videoDir, { recursive: true });

      const recordVideoOptions: playwright.BrowserContextOptions['recordVideo'] = {
        dir: videoDir,
        size: DEFAULT_VIDEO_SIZE
      };

      // Start video recording (Playwright captures at native ~25 fps)
      // NOTE: This recreates the browser context, so we need fresh references after
      await context.startVideoRecording(recordVideoOptions);

      // Get fresh references after browser context recreation
      const freshTab = context.currentTabOrDie();
      const freshBrowserContext = freshTab.page.context();

      // Re-inject overlay into the fresh page since context was recreated
      const position = videoRecordingState.overlayPosition;
      const sessionId = videoRecordingState.sessionId!;
      await context.injectRecordingOverlay(freshTab.page, position, sessionId);

      // Set up overlay injection for future pages on the new context
      freshBrowserContext.on('page', async page => {
        await context.injectRecordingOverlay(page, position, sessionId);
      });

      // Update state
      videoRecordingState.isRecording = true;
      videoRecordingState.startTime = new Date();
      videoRecordingState.filename = filename;
      videoRecordingState.videoPath = videoFilePath;
      videoRecordingState.browserContext = freshBrowserContext;
      videoRecordingState.overlayState = 'recording';
      delete videoRecordingState.stopTime;

      // Start 7-minute recording timeout
      startRecordingTimeout(context);

      // T027: Update overlay visual state using fresh page reference
      await updateOverlayState(freshTab.page, 'recording');

      message = 'Recording resumed (new recording started, max duration: 7 minutes)';
    } else if (action === 'stop') {
    // T026: Implement "stop" action handler
      // Clear the recording timeout
      if (videoRecordingState.recordingTimeout) {
        clearTimeout(videoRecordingState.recordingTimeout);
        videoRecordingState.recordingTimeout = undefined;
      }

      // Stop the recording and finalize video
      const stopResult = await context.stopVideoRecording();

      if (stopResult && videoRecordingState.startTime) {
        videoPath = stopResult;
        const stopTime = new Date();
        duration = (stopTime.getTime() - videoRecordingState.startTime.getTime()) / 1000;

        // Update state
        videoRecordingState.isRecording = false;
        videoRecordingState.overlayState = 'stopped';
        videoRecordingState.stopTime = stopTime;

        // T027: Update overlay visual state
        await updateOverlayState(currentTab.page, 'stopped');

        message = `Recording stopped. Video saved to ${videoPath}`;
      } else {
        // Recording may already be stopped (e.g., by timeout)
        // This is not an error, just update state
        videoRecordingState.isRecording = false;
        videoRecordingState.overlayState = 'stopped';
        videoRecordingState.stopTime = new Date();
        await updateOverlayState(currentTab.page, 'stopped');

        videoPath = videoRecordingState.videoPath || null;
        message = `Recording stopped (was already stopped or timed out). Video path: ${videoPath || 'not available'}`;
      }
    }

    const currentState = videoRecordingState.overlayState;

    const code = [
      `// Execute recording control action: ${action}`,
      `const action = '${action}';`,
      `const previousState = '${previousState}';`,
      `const currentState = '${currentState}';`,
      videoPath ? `// Video saved to: ${videoPath}` : ''
    ].filter(Boolean);

    return {
      code,
      captureSnapshot: false,
      waitForNetwork: false,
      resultOverride: {
        content: [{
          type: 'text' as const,
          text: [
            `Recording control action executed:`,
            ``,
            `Action: ${action}`,
            `Previous state: ${previousState}`,
            `Current state: ${currentState}`,
            videoPath ? `Video path: ${videoPath}` : '',
            duration !== null ? `Duration: ${duration.toFixed(2)} seconds` : '',
            ``,
            message
          ].filter(Boolean).join('\n')
        }]
      }
    };
  }
});

// T034: Browser video status tool (consolidated from overlay_status + get_status)
const videoStatusSchema = z.object({});

const videoStatus = defineTool({
  capability: 'video',
  schema: {
    name: 'browser_video_status',
    title: 'Get video recording status',
    description: `Query current video recording state, overlay status, duration, and video file path. Returns comprehensive status for LLMs to verify recording state before control actions.

**Returns:**
- Overlay enabled/position/session ID
- Recording state (idle/recording/stopped)
- Elapsed time and timestamps
- Video path (after recording stops)
- Video metadata (format, resolution, file size)

**Recording Specs:**
- Format: WebM (VP8)
- Resolution: ${DEFAULT_VIDEO_SIZE.width}x${DEFAULT_VIDEO_SIZE.height}
- FPS: ~25 fps (Playwright native)

**Use browser_video_convert after recording to:**
- Convert to MP4 for universal compatibility
- Adjust FPS: 15 fps (default) or 30 fps (smooth animations)`,
    inputSchema: videoStatusSchema,
    type: 'readOnly',
  },

  handle: async context => {
    // T038: Error handling for CONTEXT_CLOSED
    try {
      await context.ensureTab();
    } catch (error) {
      throw new Error('CONTEXT_CLOSED: Browser context is closed, cannot query status. Create new browser context before querying status.');
    }

    // T035: Calculate elapsed time
    let elapsedTime = 0;
    if (videoRecordingState.startTime) {
      const endTime = videoRecordingState.stopTime || new Date();
      elapsedTime = (endTime.getTime() - videoRecordingState.startTime.getTime()) / 1000;
    }

    // T036: Video metadata extraction (available after stop)
    let videoMetadata: {
      format: string;
      duration: number;
      resolution: { width: number; height: number };
      fileSize: number;
    } | null = null;

    if (videoRecordingState.overlayState === 'stopped' && videoRecordingState.videoPath) {
      try {
        const stats = await fs.promises.stat(videoRecordingState.videoPath);
        videoMetadata = {
          format: 'webm',
          duration: elapsedTime,
          resolution: DEFAULT_VIDEO_SIZE,
          fileSize: stats.size
        };
      } catch (error) {
        // File may not exist yet, this is non-fatal
        const debugError = debug('pw:mcp:overlay');
        debugError('Failed to get video file stats:', error);
      }
    }

    const status = {
      overlayEnabled: videoRecordingState.overlayEnabled,
      overlayPosition: videoRecordingState.overlayEnabled ? videoRecordingState.overlayPosition : null,
      sessionId: videoRecordingState.sessionId,
      state: videoRecordingState.overlayState,
      elapsedTime,
      startTime: videoRecordingState.startTime?.toISOString() || null,
      stopTime: videoRecordingState.stopTime?.toISOString() || null,
      videoPath: videoRecordingState.overlayState === 'stopped' ? videoRecordingState.videoPath : null,
      videoMetadata
    };

    const code = [
      `// Query recording overlay status`,
      `const status = ${JSON.stringify(status, null, 2)};`
    ];

    return {
      code,
      captureSnapshot: false,
      waitForNetwork: false,
      resultOverride: {
        content: [{
          type: 'text' as const,
          text: [
            `Video Recording Status:`,
            ``,
            `Overlay Enabled: ${status.overlayEnabled}`,
            status.overlayEnabled ? `Position: ${status.overlayPosition}` : '',
            status.overlayEnabled ? `Session ID: ${status.sessionId}` : '',
            `State: ${status.state}`,
            status.elapsedTime > 0 ? `Elapsed Time: ${status.elapsedTime.toFixed(2)} seconds` : '',
            status.startTime ? `Start Time: ${status.startTime}` : '',
            status.stopTime ? `Stop Time: ${status.stopTime}` : '',
            status.videoPath ? `Video Path: ${status.videoPath}` : '',
            status.videoMetadata ? `Video Size: ${(status.videoMetadata.fileSize / 1024).toFixed(1)} KB` : ''
          ].filter(Boolean).join('\n')
        }]
      }
    };
  }
});

export default [
  // Core recording tools (overlay-based)
  videoOverlayEnable,
  videoOverlayControl,
  videoStatus,
  // Post-processing tools
  videoConvert,
  videoSave,
];
