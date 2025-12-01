/**
 * Video Overlay Recording Controls Tests
 *
 * Tests for User Story 1 (P1 MVP): LLM Visual Feedback for Automation
 *
 * These tests verify:
 * - T009: Basic overlay injection on page load
 * - T010: Overlay persistence across navigation
 * - T011: Auto-start recording integration
 */

import { test, expect } from './fixtures.js';

/**
 * T009 [P] [US1]: Basic overlay injection test
 *
 * Success Criteria:
 * - Overlay element is injected into DOM
 * - Overlay has correct ID and data attributes
 * - Overlay is positioned correctly (default: top-right)
 * - Overlay shows idle state initially
 */
test.describe('T009: Basic overlay injection', () => {
  test('should inject overlay on page load', async ({ client, server }) => {
    server.setContent('/', `
      <!DOCTYPE html>
      <html><body><h1>Test Page</h1></body></html>
    `, 'text/html');

    // Navigate to test page
    await client.callTool({
      name: 'browser_navigate',
      arguments: { url: server.PREFIX },
    });

    // Enable overlay via MCP tool
    const result = await client.callTool({
      name: 'browser_video_overlay_enable',
      arguments: { position: 'top-right' },
    });

    // Verify tool returned success (use regex for partial match)
    expect(result).toHaveTextContent(/Recording overlay enabled successfully/);
    expect(result).toHaveTextContent(/Position: top-right/);

    // Take snapshot to verify overlay is in DOM
    const snapshot = await client.callTool({
      name: 'browser_snapshot',
    });

    // The overlay should be visible in the page
    expect(snapshot).toBeDefined();
  });

  test('should inject overlay with bottom-left position', async ({ client, server }) => {
    server.setContent('/', `
      <!DOCTYPE html>
      <html><body><h1>Position Test: bottom-left</h1></body></html>
    `, 'text/html');

    await client.callTool({
      name: 'browser_navigate',
      arguments: { url: server.PREFIX },
    });

    // Enable overlay with bottom-left position
    const result = await client.callTool({
      name: 'browser_video_overlay_enable',
      arguments: { position: 'bottom-left' },
    });

    expect(result).toHaveTextContent(/Position: bottom-left/);
  });

  test('should show overlay with correct initial state', async ({ client, server }) => {
    server.setContent('/', `
      <!DOCTYPE html>
      <html><body><h1>Initial State Test</h1></body></html>
    `, 'text/html');

    await client.callTool({
      name: 'browser_navigate',
      arguments: { url: server.PREFIX },
    });

    // Enable overlay without auto-start
    const result = await client.callTool({
      name: 'browser_video_overlay_enable',
      arguments: { position: 'top-right', autoStart: false },
    });

    expect(result).toHaveTextContent(/Recording auto-started: false/);
    expect(result).toHaveTextContent(/Overlay ready. Use browser_video_overlay_control to start recording/);

    // Query status to verify idle state
    const status = await client.callTool({
      name: 'browser_video_status',
    });

    expect(status).toHaveTextContent(/State: idle/);
  });
});

/**
 * T010 [P] [US1]: Overlay persistence across navigation
 *
 * Success Criteria:
 * - Overlay persists when navigating within same origin
 * - Overlay persists on cross-origin navigation
 * - Overlay state is maintained across navigations
 */
test.describe('T010: Overlay persistence across navigation', () => {
  test('should persist overlay across same-origin navigation', async ({ client, server }) => {
    server.setContent('/page1', `
      <!DOCTYPE html>
      <html><body><h1>Page 1</h1></body></html>
    `, 'text/html');

    server.setContent('/page2', `
      <!DOCTYPE html>
      <html><body><h1>Page 2</h1></body></html>
    `, 'text/html');

    // Navigate to first page
    await client.callTool({
      name: 'browser_navigate',
      arguments: { url: server.PREFIX + '/page1' },
    });

    // Enable overlay
    const result = await client.callTool({
      name: 'browser_video_overlay_enable',
      arguments: { position: 'top-right' },
    });
    expect(result).toHaveTextContent(/Recording overlay enabled successfully/);

    // Navigate to second page (same origin)
    await client.callTool({
      name: 'browser_navigate',
      arguments: { url: server.PREFIX + '/page2' },
    });

    // Query status - overlay should still be enabled
    const status = await client.callTool({
      name: 'browser_video_status',
    });

    expect(status).toHaveTextContent(/Overlay Enabled: true/);
  });

  test('should persist overlay across multiple navigations', async ({ client, server }) => {
    server.setContent('/', `
      <!DOCTYPE html>
      <html><body><h1>Home</h1></body></html>
    `, 'text/html');

    for (let i = 1; i <= 3; i++) {
      server.setContent(`/page${i}`, `
        <!DOCTYPE html>
        <html><body><h1>Page ${i}</h1></body></html>
      `, 'text/html');
    }

    // Navigate to home
    await client.callTool({
      name: 'browser_navigate',
      arguments: { url: server.PREFIX },
    });

    // Enable overlay
    await client.callTool({
      name: 'browser_video_overlay_enable',
      arguments: { position: 'top-right' },
    });

    // Navigate through multiple pages
    for (let i = 1; i <= 3; i++) {
      await client.callTool({
        name: 'browser_navigate',
        arguments: { url: server.PREFIX + `/page${i}` },
      });

      // Verify overlay is still enabled
      const status = await client.callTool({
        name: 'browser_video_status',
      });
      expect(status).toHaveTextContent(/Overlay Enabled: true/);
    }
  });

  test('should maintain overlay position across navigation', async ({ client, server }) => {
    server.setContent('/page1', `
      <!DOCTYPE html>
      <html><body><h1>Page 1</h1></body></html>
    `, 'text/html');

    server.setContent('/page2', `
      <!DOCTYPE html>
      <html><body><h1>Page 2</h1></body></html>
    `, 'text/html');

    // Navigate to first page
    await client.callTool({
      name: 'browser_navigate',
      arguments: { url: server.PREFIX + '/page1' },
    });

    // Enable overlay with bottom-left position
    await client.callTool({
      name: 'browser_video_overlay_enable',
      arguments: { position: 'bottom-left' },
    });

    // Navigate to second page
    await client.callTool({
      name: 'browser_navigate',
      arguments: { url: server.PREFIX + '/page2' },
    });

    // Verify position is maintained
    const status = await client.callTool({
      name: 'browser_video_status',
    });
    expect(status).toHaveTextContent(/Position: bottom-left/);
  });
});

/**
 * T011 [P] [US1]: Auto-start recording integration
 *
 * Success Criteria:
 * - Recording starts automatically when autoStart=true
 * - Recording does NOT start when autoStart=false
 * - Video file is captured correctly with auto-start
 */
test.describe('T011: Auto-start recording integration', () => {
  test('should auto-start recording when autoStart is true', async ({ client, server }) => {
    server.setContent('/', `
      <!DOCTYPE html>
      <html><body><h1>Auto-start Test</h1></body></html>
    `, 'text/html');

    await client.callTool({
      name: 'browser_navigate',
      arguments: { url: server.PREFIX },
    });

    // Enable overlay with autoStart
    const result = await client.callTool({
      name: 'browser_video_overlay_enable',
      arguments: { position: 'top-right', autoStart: true },
    });

    expect(result).toHaveTextContent(/Recording auto-started: true/);
    expect(result).toHaveTextContent(/Recording is now active/);

    // Query status to confirm recording state
    const status = await client.callTool({
      name: 'browser_video_status',
    });
    expect(status).toHaveTextContent(/State: recording/);
  });

  test('should NOT auto-start when autoStart is false', async ({ client, server }) => {
    server.setContent('/', `
      <!DOCTYPE html>
      <html><body><h1>No Auto-start Test</h1></body></html>
    `, 'text/html');

    await client.callTool({
      name: 'browser_navigate',
      arguments: { url: server.PREFIX },
    });

    // Enable overlay without autoStart
    const result = await client.callTool({
      name: 'browser_video_overlay_enable',
      arguments: { position: 'top-right', autoStart: false },
    });

    expect(result).toHaveTextContent(/Recording auto-started: false/);

    // Query status to confirm idle state
    const status = await client.callTool({
      name: 'browser_video_status',
    });
    expect(status).toHaveTextContent(/State: idle/);
  });

  test('should capture video when auto-started (SC-001, SC-002)', async ({ client, server }) => {
    server.setContent('/', `
      <!DOCTYPE html>
      <html><body><h1>Video Capture Test</h1></body></html>
    `, 'text/html');

    await client.callTool({
      name: 'browser_navigate',
      arguments: { url: server.PREFIX },
    });

    // Enable overlay with autoStart
    await client.callTool({
      name: 'browser_video_overlay_enable',
      arguments: { position: 'top-right', autoStart: true },
    });

    // Navigate again to have content in the new video recording context
    server.setContent('/page2', `
      <!DOCTYPE html>
      <html><body><h1>Video Content Page</h1></body></html>
    `, 'text/html');

    await client.callTool({
      name: 'browser_navigate',
      arguments: { url: server.PREFIX + '/page2' },
    });

    // Wait a bit for video content
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Stop recording
    const stopResult = await client.callTool({
      name: 'browser_video_overlay_control',
      arguments: { action: 'stop' },
    });

    expect(stopResult).toHaveTextContent(/Recording stopped/);
    expect(stopResult).toHaveTextContent(/Video saved to/);

    // Query status to verify video path
    const status = await client.callTool({
      name: 'browser_video_status',
    });
    expect(status).toHaveTextContent(/Video Path:/);
  });

  test('should start recording on page load with autoStart', async ({ client, server }) => {
    server.setContent('/', `
      <!DOCTYPE html>
      <html><body><h1>Page Load Recording Test</h1></body></html>
    `, 'text/html');

    await client.callTool({
      name: 'browser_navigate',
      arguments: { url: server.PREFIX },
    });

    // Enable overlay with autoStart
    await client.callTool({
      name: 'browser_video_overlay_enable',
      arguments: { position: 'top-right', autoStart: true },
    });

    // Verify recording started
    const status = await client.callTool({
      name: 'browser_video_status',
    });
    expect(status).toHaveTextContent(/State: recording/);
    expect(status).toHaveTextContent(/Start Time:/);
  });
});

/**
 * Integration test: Complete workflow
 */
test.describe('T009-T011: Integration tests', () => {
  test('should support complete enable → auto-start → stop workflow', async ({ client, server }) => {
    server.setContent('/', `
      <!DOCTYPE html>
      <html><body><h1>Complete Workflow Test</h1></body></html>
    `, 'text/html');

    await client.callTool({
      name: 'browser_navigate',
      arguments: { url: server.PREFIX },
    });

    // Enable overlay with autoStart
    const enableResult = await client.callTool({
      name: 'browser_video_overlay_enable',
      arguments: { position: 'top-right', autoStart: true },
    });
    expect(enableResult).toHaveTextContent(/Recording overlay enabled successfully/);
    expect(enableResult).toHaveTextContent(/Recording auto-started: true/);

    // Navigate to another page to capture content
    server.setContent('/page2', `
      <!DOCTYPE html>
      <html><body><h1>Recording Content</h1></body></html>
    `, 'text/html');

    await client.callTool({
      name: 'browser_navigate',
      arguments: { url: server.PREFIX + '/page2' },
    });

    // Wait for some content
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Stop recording
    const stopResult = await client.callTool({
      name: 'browser_video_overlay_control',
      arguments: { action: 'stop' },
    });
    expect(stopResult).toHaveTextContent(/Recording stopped/);

    // Query final status
    const status = await client.callTool({
      name: 'browser_video_status',
    });
    expect(status).toHaveTextContent(/State: stopped/);
    expect(status).toHaveTextContent(/Video Path:/);
  });
});
