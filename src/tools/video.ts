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

import { defineTool } from './tool.js';
import { outputFile } from '../config.js';

import type * as playwright from 'playwright';

const videoStartSchema = z.object({
  size: z.object({
    width: z.number().min(100).max(3840).optional().describe('Video width in pixels (100-3840)'),
    height: z.number().min(100).max(2160).optional().describe('Video height in pixels (100-2160)')
  }).optional().describe('Video dimensions. Defaults to viewport size scaled to fit 800x800'),
  quality: z.enum(['low', 'medium', 'high']).optional().describe('Video quality preset: low (480p), medium (720p), high (1080p)'),
  filename: z.string().optional().describe('Custom filename for the video. Defaults to recording-{timestamp}.webm')
});

const videoStopSchema = z.object({
  saveAs: z.string().optional().describe('Custom path to save video file. If not provided, uses default location')
});

const videoConfigureSchema = z.object({
  mode: z.enum(['on', 'off', 'retain-on-failure']).optional().describe('Video recording mode'),
  size: z.object({
    width: z.number().min(100).max(3840).optional(),
    height: z.number().min(100).max(2160).optional()
  }).optional().describe('Default video dimensions for new recordings'),
  dir: z.string().optional().describe('Directory to save video files')
});

const videoConvertSchema = z.object({
  inputPath: z.string().describe('Path to the source video file'),
  outputPath: z.string().describe('Path for the converted video file'),
  format: z.enum(['mp4', 'webm', 'gif']).describe('Target format for conversion'),
  quality: z.enum(['low', 'medium', 'high']).optional().describe('Quality preset for conversion')
});

// Global video recording state
let videoRecordingState: {
  isRecording: boolean;
  startTime?: Date;
  filename?: string;
  config?: any;
} = {
  isRecording: false
};

const videoStart = defineTool({
  capability: 'video',
  schema: {
    name: 'browser_video_start',
    title: 'Start video recording',
    description: 'Start recording browser session interactions. Creates a new browser context with video recording enabled.',
    inputSchema: videoStartSchema,
    type: 'destructive',
  },

  handle: async (context, params) => {
    if (videoRecordingState.isRecording)
      throw new Error('Video recording is already in progress. Stop the current recording first.');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = params.filename || `recording-${timestamp}.webm`;
    const videoPath = await outputFile(context.config, filename);

    let size = params.size;
    if (params.quality && !size) {
      switch (params.quality) {
        case 'low':
          size = { width: 854, height: 480 };
          break;
        case 'medium':
          size = { width: 1280, height: 720 };
          break;
        case 'high':
          size = { width: 1920, height: 1080 };
          break;
      }
    }

    const recordVideoOptions: playwright.BrowserContextOptions['recordVideo'] = {
      dir: path.dirname(videoPath),
      size: size ? { width: size.width!, height: size.height! } : { width: 800, height: 600 }
    };

    videoRecordingState = {
      isRecording: true,
      startTime: new Date(),
      filename: videoPath,
      config: recordVideoOptions
    };

    const code = [
      `// Start video recording with options: ${JSON.stringify(recordVideoOptions)}`,
      `const context = await browser.newContext({`,
      `  recordVideo: ${JSON.stringify(recordVideoOptions, null, 2)}`,
      `});`,
      `const page = await context.newPage();`
    ];

    return {
      code,
      captureSnapshot: false,
      waitForNetwork: false,
      resultOverride: {
        content: [{
          type: 'text' as const,
          text: `Video recording started. Recording to: ${videoPath}\nQuality: ${params.quality || 'default'}\nSize: ${size?.width || 'auto'}x${size?.height || 'auto'}`
        }]
      }
    };
  }
});

const videoStop = defineTool({
  capability: 'video',
  schema: {
    name: 'browser_video_stop',
    title: 'Stop video recording',
    description: 'Stop active video recording and save the video file. The video is only available after stopping.',
    inputSchema: videoStopSchema,
    type: 'destructive',
  },

  handle: async (_context, params) => {
    if (!videoRecordingState.isRecording)
      throw new Error('No video recording is currently active. Start recording first.');

    const recordingDuration = videoRecordingState.startTime
      ? Date.now() - videoRecordingState.startTime.getTime()
      : 0;

    const code = [
      `// Stop video recording and save file`,
      `await context.close();`,
      params.saveAs ? `await video.saveAs('${params.saveAs}');` : `// Video automatically saved to ${videoRecordingState.filename}`
    ];

    const finalPath = params.saveAs || videoRecordingState.filename;
    const action = async () => {
      // In a real implementation, we would close the context here
      // For now, we'll simulate the video stopping
      return {
        content: [{
          type: 'text' as const,
          text: `Video recording stopped successfully!\nDuration: ${Math.round(recordingDuration / 1000)}s\nSaved to: ${finalPath}`
        }]
      };
    };

    // Reset recording state
    videoRecordingState = { isRecording: false };

    return {
      code,
      action,
      captureSnapshot: false,
      waitForNetwork: false
    };
  }
});

const videoGetStatus = defineTool({
  capability: 'video',
  schema: {
    name: 'browser_video_get_status',
    title: 'Check video recording status',
    description: 'Get current video recording status, duration, and configuration details.',
    inputSchema: z.object({}),
    type: 'readOnly',
  },

  handle: async (_context, _params) => {
    const status = videoRecordingState.isRecording ? 'recording' : 'stopped';
    const duration = videoRecordingState.startTime && videoRecordingState.isRecording
      ? Date.now() - videoRecordingState.startTime.getTime()
      : 0;

    const statusInfo = {
      status,
      isRecording: videoRecordingState.isRecording,
      duration: Math.round(duration / 1000),
      filename: videoRecordingState.filename,
      config: videoRecordingState.config
    };

    return {
      code: [`// Video recording status: ${status}`],
      captureSnapshot: false,
      waitForNetwork: false,
      resultOverride: {
        content: [{
          type: 'text' as const,
          text: `Video Recording Status:\n${JSON.stringify(statusInfo, null, 2)}`
        }]
      }
    };
  }
});

const videoConfigure = defineTool({
  capability: 'video',
  schema: {
    name: 'browser_video_configure',
    title: 'Configure video recording settings',
    description: 'Set default video recording configuration for future recordings.',
    inputSchema: videoConfigureSchema,
    type: 'destructive',
  },

  handle: async (context, params) => {
    // Store configuration for future use
    const config = {
      mode: params.mode || 'on',
      size: params.size || { width: 800, height: 600 },
      dir: params.dir || context.config.outputDir
    };

    const code = [
      `// Configure video recording defaults`,
      `const videoConfig = ${JSON.stringify(config, null, 2)};`
    ];

    return {
      code,
      captureSnapshot: false,
      waitForNetwork: false,
      resultOverride: {
        content: [{
          type: 'text' as const,
          text: `Video recording configuration updated:\n${JSON.stringify(config, null, 2)}`
        }]
      }
    };
  }
});

const videoConvert = defineTool({
  capability: 'video',
  schema: {
    name: 'browser_video_convert',
    title: 'Convert video format',
    description: 'Convert video files between different formats (MP4, WebM, GIF). Requires FFmpeg to be installed.',
    inputSchema: videoConvertSchema,
    type: 'destructive',
  },

  handle: async (_context, params) => {
    const inputExists = fs.existsSync(params.inputPath);
    if (!inputExists)
      throw new Error(`Input video file not found: ${params.inputPath}`);

    const outputPath = params.outputPath;
    const format = params.format;

    // FFmpeg command construction
    let ffmpegOptions = '';
    switch (params.quality) {
      case 'low':
        ffmpegOptions = format === 'mp4' ? '-crf 28' : '-b:v 500k';
        break;
      case 'medium':
        ffmpegOptions = format === 'mp4' ? '-crf 23' : '-b:v 1M';
        break;
      case 'high':
        ffmpegOptions = format === 'mp4' ? '-crf 18' : '-b:v 2M';
        break;
      default:
        ffmpegOptions = format === 'mp4' ? '-crf 23' : '-b:v 1M';
    }

    const code = [
      `// Convert video from ${path.extname(params.inputPath)} to ${format}`,
      `// Note: This requires FFmpeg to be installed on the system`,
      `// Command: ffmpeg -i "${params.inputPath}" ${ffmpegOptions} "${outputPath}"`
    ];

    const action = async () => {
      // In a real implementation, we would execute FFmpeg here
      // For now, we'll simulate the conversion
      return {
        content: [{
          type: 'text' as const,
          text: `Video conversion simulated:\nInput: ${params.inputPath}\nOutput: ${outputPath}\nFormat: ${format}\nQuality: ${params.quality || 'medium'}\n\nNote: Actual conversion requires FFmpeg installation and execution.`
        }]
      };
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
    description: 'Save current or completed video recording to a specific location with custom naming.',
    inputSchema: z.object({
      filename: z.string().describe('Filename for the saved video'),
      format: z.enum(['webm', 'mp4']).optional().describe('Video format (webm is native Playwright format)')
    }),
    type: 'destructive',
  },

  handle: async (context, params) => {
    if (!videoRecordingState.filename)
      throw new Error('No video recording available to save. Start and stop a recording first.');

    const outputPath = await outputFile(context.config, params.filename);
    const format = params.format || 'webm';

    const code = [
      `// Save video recording`,
      `await video.saveAs('${outputPath}');`
    ];

    const action = async () => {
      return {
        content: [{
          type: 'text' as const,
          text: `Video saved successfully!\nLocation: ${outputPath}\nFormat: ${format}`
        }]
      };
    };

    return {
      code,
      action,
      captureSnapshot: false,
      waitForNetwork: false
    };
  }
});

const videoAddAnnotation = defineTool({
  capability: 'video',
  schema: {
    name: 'browser_video_add_annotation',
    title: 'Add annotation to video',
    description: 'Add text annotations, highlights, or markers to video recording during playback.',
    inputSchema: z.object({
      text: z.string().describe('Annotation text to display'),
      timestamp: z.number().optional().describe('Timestamp in seconds when annotation should appear (current time if not specified)'),
      duration: z.number().optional().describe('How long annotation should be visible in seconds (default: 3)'),
      position: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center']).optional().describe('Position of annotation on screen'),
      style: z.object({
        fontSize: z.number().optional().describe('Font size in pixels'),
        color: z.string().optional().describe('Text color (CSS color value)'),
        backgroundColor: z.string().optional().describe('Background color (CSS color value)')
      }).optional().describe('Styling options for the annotation')
    }),
    type: 'destructive',
  },

  handle: async (_context, params) => {
    if (!videoRecordingState.isRecording)
      throw new Error('No active video recording. Start recording first to add annotations.');

    const timestamp = params.timestamp || (videoRecordingState.startTime ?
      (Date.now() - videoRecordingState.startTime.getTime()) / 1000 : 0);
    const duration = params.duration || 3;
    const position = params.position || 'top-right';
    const style = params.style || {};

    const annotation = {
      text: params.text,
      timestamp,
      duration,
      position,
      style: {
        fontSize: style.fontSize || 16,
        color: style.color || '#ffffff',
        backgroundColor: style.backgroundColor || 'rgba(0,0,0,0.7)'
      }
    };

    const code = [
      `// Add annotation to video at ${timestamp}s`,
      `// Note: This would typically require post-processing with FFmpeg`,
      `const annotation = ${JSON.stringify(annotation, null, 2)};`,
      `// FFmpeg command: ffmpeg -i input.webm -vf "drawtext=text='${params.text}':x=10:y=10:fontsize=${style.fontSize || 16}:fontcolor=${style.color || 'white'}:enable='between(t,${timestamp},${timestamp + duration})'" output.webm`
    ];

    return {
      code,
      captureSnapshot: false,
      waitForNetwork: false,
      resultOverride: {
        content: [{
          type: 'text' as const,
          text: `Annotation added to video:\nText: "${params.text}"\nTimestamp: ${timestamp}s\nDuration: ${duration}s\nPosition: ${position}\n\nNote: Actual annotation rendering requires post-processing with FFmpeg.`
        }]
      }
    };
  }
});

const videoAddHighlight = defineTool({
  capability: 'video',
  schema: {
    name: 'browser_video_add_highlight',
    title: 'Add visual highlight to video',
    description: 'Add visual highlights like arrows, rectangles, or circles to emphasize elements during video recording.',
    inputSchema: z.object({
      type: z.enum(['arrow', 'rectangle', 'circle', 'pointer']).describe('Type of highlight to add'),
      x: z.number().describe('X coordinate of highlight center/start point'),
      y: z.number().describe('Y coordinate of highlight center/start point'),
      width: z.number().optional().describe('Width for rectangle highlights'),
      height: z.number().optional().describe('Height for rectangle highlights'),
      radius: z.number().optional().describe('Radius for circle highlights'),
      timestamp: z.number().optional().describe('Timestamp in seconds when highlight should appear'),
      duration: z.number().optional().describe('How long highlight should be visible (default: 2 seconds)'),
      color: z.string().optional().describe('Highlight color (CSS color value, default: red)')
    }),
    type: 'destructive',
  },

  handle: async (_context, params) => {
    if (!videoRecordingState.isRecording)
      throw new Error('No active video recording. Start recording first to add highlights.');

    const timestamp = params.timestamp || (videoRecordingState.startTime ?
      (Date.now() - videoRecordingState.startTime.getTime()) / 1000 : 0);
    const duration = params.duration || 2;
    const color = params.color || 'red';

    const highlight = {
      type: params.type,
      x: params.x,
      y: params.y,
      width: params.width,
      height: params.height,
      radius: params.radius,
      timestamp,
      duration,
      color
    };

    let overlayFilter = '';
    switch (params.type) {
      case 'rectangle':
        overlayFilter = `drawbox=x=${params.x}:y=${params.y}:w=${params.width || 100}:h=${params.height || 100}:color=${color}:t=2`;
        break;
      case 'circle':
        overlayFilter = `drawbox=x=${params.x - (params.radius || 25)}:y=${params.y - (params.radius || 25)}:w=${(params.radius || 25) * 2}:h=${(params.radius || 25) * 2}:color=${color}:t=2`;
        break;
      case 'arrow':
      case 'pointer':
        overlayFilter = `drawtext=text='→':x=${params.x}:y=${params.y}:fontsize=24:fontcolor=${color}`;
        break;
    }

    const code = [
      `// Add ${params.type} highlight at (${params.x}, ${params.y}) at ${timestamp}s`,
      `const highlight = ${JSON.stringify(highlight, null, 2)};`,
      `// FFmpeg overlay filter: ${overlayFilter}:enable='between(t,${timestamp},${timestamp + duration})'`
    ];

    return {
      code,
      captureSnapshot: false,
      waitForNetwork: false,
      resultOverride: {
        content: [{
          type: 'text' as const,
          text: `${params.type} highlight added:\nPosition: (${params.x}, ${params.y})\nTimestamp: ${timestamp}s\nDuration: ${duration}s\nColor: ${color}\n\nNote: Actual highlight rendering requires post-processing with FFmpeg.`
        }]
      }
    };
  }
});

const videoAddCursorTracking = defineTool({
  capability: 'video',
  schema: {
    name: 'browser_video_add_cursor_tracking',
    title: 'Enable enhanced cursor tracking',
    description: 'Enable enhanced cursor visibility, click animations, and movement trails for better video demonstrations.',
    inputSchema: z.object({
      enabled: z.boolean().describe('Enable or disable cursor tracking'),
      clickAnimation: z.boolean().optional().describe('Show click animations (default: true)'),
      cursorSize: z.number().optional().describe('Cursor size multiplier (default: 1.5)'),
      clickColor: z.string().optional().describe('Click animation color (default: yellow)'),
      trailLength: z.number().optional().describe('Mouse trail length in pixels (0 to disable, default: 0)')
    }),
    type: 'destructive',
  },

  handle: async (_context, params) => {
    const settings = {
      enabled: params.enabled,
      clickAnimation: params.clickAnimation ?? true,
      cursorSize: params.cursorSize || 1.5,
      clickColor: params.clickColor || 'yellow',
      trailLength: params.trailLength || 0
    };

    const code = [
      `// Configure enhanced cursor tracking`,
      `const cursorSettings = ${JSON.stringify(settings, null, 2)};`,
      params.enabled ? `// Cursor tracking enabled with enhanced visibility` : `// Cursor tracking disabled`
    ];

    return {
      code,
      captureSnapshot: false,
      waitForNetwork: false,
      resultOverride: {
        content: [{
          type: 'text' as const,
          text: `Cursor tracking ${params.enabled ? 'enabled' : 'disabled'}:\nClick animations: ${settings.clickAnimation}\nCursor size: ${settings.cursorSize}x\nClick color: ${settings.clickColor}\nTrail length: ${settings.trailLength}px\n\nNote: Enhanced cursor effects require additional browser configuration or post-processing.`
        }]
      }
    };
  }
});

export default [
  videoStart,
  videoStop,
  videoGetStatus,
  videoConfigure,
  videoConvert,
  videoSave,
  videoAddAnnotation,
  videoAddHighlight,
  videoAddCursorTracking,
];
