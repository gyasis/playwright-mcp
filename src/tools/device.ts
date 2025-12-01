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
import { defineTool, type ToolFactory } from './tool.js';

const switchDevice: ToolFactory = captureSnapshot => defineTool({
  capability: 'core',

  schema: {
    name: 'browser_switch_device',
    title: 'Switch device emulation mode',
    description: 'Switch between desktop and mobile device emulation. Recreates browser context with new device settings.',
    inputSchema: z.object({
      device: z.string().describe('Device to emulate. Use "desktop" for desktop mode, or device names like "iPhone 15", "Pixel 7", "iPad Pro". Supports aliases: "iphone", "android", "mobile", "ipad".'),
    }),
    type: 'destructive',
  },

  handle: async (context, params) => {
    const deviceName = params.device;

    // Switch to the new device
    await context.switchDevice(deviceName);

    const code = [
      `// Switch device emulation to ${deviceName}`,
      `// This recreates the browser context with new device settings`,
      deviceName === 'desktop'
        ? `// Desktop mode: full viewport, desktop user agent`
        : `// Mobile emulation: ${deviceName} viewport, user agent, and touch support`,
    ];

    return {
      code,
      captureSnapshot,
      waitForNetwork: false,
    };
  },
});

export default (captureSnapshot: boolean) => [
  switchDevice(captureSnapshot),
];
