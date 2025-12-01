/**
 * Test fixtures for overlay recording controls
 *
 * Provides reusable test utilities, constants, and helper functions
 * for testing browser overlay recording functionality.
 */

import { type Page, type BrowserContext } from '@playwright/test';
import type { OverlayPosition, RecordingState } from '../../src/tools/overlay-template.js';

/**
 * Test constants for overlay testing
 */
export const OVERLAY_TEST_CONSTANTS = {
  OVERLAY_ID: 'playwright-recording-overlay',
  DEFAULT_POSITION: 'top-right' as OverlayPosition,
  DEFAULT_SESSION_ID: 'test-session-123',
  CONTROL_RESPONSE_TIMEOUT: 500, // ms - per SC-004 success criteria
  VIDEO_DELIVERY_TIMEOUT: 5000, // ms - per SC-001 success criteria
  MIN_FPS: 15, // per SC-002 success criteria
  MAX_RECORDING_DURATION: 600, // seconds (10 minutes) - per SC-005
} as const;

/**
 * Overlay state expectations for testing
 */
export const OVERLAY_STATES = {
  idle: {
    className: '',
    statusText: 'Not Recording',
    recordButtonDisabled: false,
    stopButtonDisabled: true,
  },
  recording: {
    className: 'recording',
    statusText: 'Recording',
    recordButtonDisabled: true,
    stopButtonDisabled: false,
  },
  stopped: {
    className: '',
    statusText: 'Recording Stopped',
    recordButtonDisabled: false,
    stopButtonDisabled: true,
  },
} as const;

/**
 * Test helper: Wait for overlay to be injected and visible
 */
export async function waitForOverlayInjection(page: Page, timeout = 3000): Promise<void> {
  await page.waitForSelector(`#${OVERLAY_TEST_CONSTANTS.OVERLAY_ID}`, { timeout });
}

/**
 * Test helper: Get overlay element
 */
export async function getOverlayElement(page: Page) {
  return page.locator(`#${OVERLAY_TEST_CONSTANTS.OVERLAY_ID}`);
}

/**
 * Test helper: Check if overlay exists
 */
export async function overlayExists(page: Page): Promise<boolean> {
  const overlay = await getOverlayElement(page);
  return (await overlay.count()) > 0;
}

/**
 * Test helper: Get overlay data attributes
 */
export async function getOverlayData(page: Page): Promise<{
  sessionId: string | null;
  state: string | null;
  position: string | null;
}> {
  const overlay = await getOverlayElement(page);
  return {
    sessionId: await overlay.getAttribute('data-session-id'),
    state: await overlay.getAttribute('data-state'),
    position: await overlay.getAttribute('data-position'),
  };
}

/**
 * Test helper: Get overlay visual state
 */
export async function getOverlayVisualState(page: Page): Promise<{
  hasRecordingClass: boolean;
  statusText: string;
  elapsedTimeVisible: boolean;
  elapsedTime: string;
  recordButtonDisabled: boolean;
  stopButtonDisabled: boolean;
}> {
  const overlay = await getOverlayElement(page);

  return {
    hasRecordingClass: await overlay.evaluate((el) => el.classList.contains('recording')),
    statusText: await page.locator(`#${OVERLAY_TEST_CONSTANTS.OVERLAY_ID} .status-label`).textContent() ?? '',
    elapsedTimeVisible: await page.locator(`#${OVERLAY_TEST_CONSTANTS.OVERLAY_ID} .elapsed-time`).isVisible(),
    elapsedTime: await page.locator(`#${OVERLAY_TEST_CONSTANTS.OVERLAY_ID} .elapsed-time`).textContent() ?? '',
    recordButtonDisabled: await page.locator(`#${OVERLAY_TEST_CONSTANTS.OVERLAY_ID} .record-btn`).isDisabled(),
    stopButtonDisabled: await page.locator(`#${OVERLAY_TEST_CONSTANTS.OVERLAY_ID} .stop-btn`).isDisabled(),
  };
}

/**
 * Test helper: Verify overlay matches expected state
 */
export async function verifyOverlayState(
  page: Page,
  expectedState: RecordingState
): Promise<void> {
  const expected = OVERLAY_STATES[expectedState];
  const actual = await getOverlayVisualState(page);

  const hasRecordingClass = expectedState === 'recording';
  if (actual.hasRecordingClass !== hasRecordingClass) {
    throw new Error(
      `Overlay class mismatch: expected ${hasRecordingClass ? 'recording' : 'no recording class'}, got ${actual.hasRecordingClass ? 'recording' : 'no recording class'}`
    );
  }

  if (!actual.statusText.includes(expected.statusText)) {
    throw new Error(`Overlay status text mismatch: expected "${expected.statusText}", got "${actual.statusText}"`);
  }

  if (actual.recordButtonDisabled !== expected.recordButtonDisabled) {
    throw new Error(
      `Record button state mismatch: expected ${expected.recordButtonDisabled ? 'disabled' : 'enabled'}, got ${actual.recordButtonDisabled ? 'disabled' : 'enabled'}`
    );
  }

  if (actual.stopButtonDisabled !== expected.stopButtonDisabled) {
    throw new Error(
      `Stop button state mismatch: expected ${expected.stopButtonDisabled ? 'disabled' : 'enabled'}, got ${actual.stopButtonDisabled ? 'disabled' : 'enabled'}`
    );
  }
}

/**
 * Test helper: Get overlay position from CSS
 */
export async function getOverlayPosition(page: Page): Promise<{
  top: number | null;
  right: number | null;
  bottom: number | null;
  left: number | null;
}> {
  const overlay = await getOverlayElement(page);
  return overlay.evaluate((el) => {
    const computed = window.getComputedStyle(el);
    return {
      top: computed.top !== 'auto' ? parseFloat(computed.top) : null,
      right: computed.right !== 'auto' ? parseFloat(computed.right) : null,
      bottom: computed.bottom !== 'auto' ? parseFloat(computed.bottom) : null,
      left: computed.left !== 'auto' ? parseFloat(computed.left) : null,
    };
  });
}

/**
 * Test helper: Verify overlay is in correct corner
 */
export async function verifyOverlayPositioning(
  page: Page,
  expectedPosition: OverlayPosition
): Promise<void> {
  const pos = await getOverlayPosition(page);

  switch (expectedPosition) {
    case 'top-left':
      if (pos.top === null || pos.left === null) {
        throw new Error(`Overlay not positioned in top-left: ${JSON.stringify(pos)}`);
      }
      break;
    case 'top-right':
      if (pos.top === null || pos.right === null) {
        throw new Error(`Overlay not positioned in top-right: ${JSON.stringify(pos)}`);
      }
      break;
    case 'bottom-left':
      if (pos.bottom === null || pos.left === null) {
        throw new Error(`Overlay not positioned in bottom-left: ${JSON.stringify(pos)}`);
      }
      break;
    case 'bottom-right':
      if (pos.bottom === null || pos.right === null) {
        throw new Error(`Overlay not positioned in bottom-right: ${JSON.stringify(pos)}`);
      }
      break;
  }
}

/**
 * Test helper: Create a test page with overlay injected
 */
export async function createPageWithOverlay(
  context: BrowserContext,
  position: OverlayPosition = OVERLAY_TEST_CONSTANTS.DEFAULT_POSITION,
  sessionId: string = OVERLAY_TEST_CONSTANTS.DEFAULT_SESSION_ID
): Promise<Page> {
  const page = await context.newPage();

  // Import overlay generation function (will be implemented in Phase 2)
  // For now, this is a placeholder that tests will use
  // The actual injection will happen via Context.injectRecordingOverlay()

  return page;
}

/**
 * Test helper: Measure time between action and visual update
 * Used to verify SC-004: <500ms control response
 */
export async function measureControlResponseTime(
  page: Page,
  action: () => Promise<void>
): Promise<number> {
  const startTime = Date.now();
  await action();
  // Wait for visual update (overlay state change)
  await page.waitForFunction(
    () => {
      const overlay = document.getElementById('playwright-recording-overlay');
      return overlay && overlay.dataset.state !== 'idle';
    },
    { timeout: OVERLAY_TEST_CONSTANTS.CONTROL_RESPONSE_TIMEOUT }
  );
  return Date.now() - startTime;
}

/**
 * Test helper: Parse elapsed time display (MM:SS format)
 */
export function parseElapsedTime(timeStr: string): number {
  const [minutes, seconds] = timeStr.split(':').map(Number);
  return minutes * 60 + seconds;
}

/**
 * Test helper: Format elapsed time for display (MM:SS format)
 */
export function formatElapsedTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}
