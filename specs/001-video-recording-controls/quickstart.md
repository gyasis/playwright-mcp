# Quickstart: Browser Overlay Recording Controls

**Feature**: 001-video-recording-controls | **Date**: 2025-11-29

---

## Overview

Browser overlay recording controls enable LLMs to receive visual feedback of browser automation actions by providing a persistent on-screen overlay with record/pause/stop buttons. This feature extends Playwright MCP's existing video recording capabilities with programmatic control and status visibility.

### What This Enables

**For LLMs**:
- Visual verification of automation actions (see what happened during browser interaction)
- Error detection through video playback (identify visual issues not caught by accessibility snapshots)
- Automated testing with visual regression evidence
- Step-by-step tutorial recording for complex workflows

**For Users**:
- Manual recording control via overlay buttons in headed mode
- Programmatic recording control via MCP tools in headless/CI environments
- Real-time recording status visibility (elapsed time, current state)
- Seamless video capture without disrupting automation workflows

### Key Characteristics

- **Persistent**: Overlay survives page navigations and remains visible throughout session
- **Lightweight**: <2% CPU overhead, minimal DOM footprint (~100x40px)
- **Cross-Browser**: Works on Chrome, Firefox, WebKit
- **Headless Compatible**: API controls work without visual overlay in headless mode
- **State-Managed**: State machine prevents invalid recording operations

---

## Basic Usage

### 1. Enable Recording Overlay

Enable the overlay on your browser session:

```typescript
// MCP tool call via Claude Code or other MCP client
{
  "tool": "browser_video_overlay_enable",
  "arguments": {
    "position": "top-right",  // Optional: "top-left", "bottom-left", "bottom-right"
    "autoStart": false        // Optional: auto-start recording when overlay enabled
  }
}
```

**Response**:
```json
{
  "success": true,
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "overlayPosition": "top-right",
  "recordingStarted": false
}
```

The overlay will appear in the specified corner of the browser window with three buttons:
- 🔴 **Record** - Start video capture
- ⏸️  **Pause** - Stop current recording (creates new file on resume)
- ⏹️  **Stop** - Finalize and save video file

### 2. Control Recording

Trigger recording actions via MCP tools:

**Start Recording**:
```typescript
{
  "tool": "browser_video_overlay_control",
  "arguments": {
    "action": "record"
  }
}
```

**Response**:
```json
{
  "success": true,
  "previousState": "idle",
  "currentState": "recording",
  "videoPath": null,
  "duration": null,
  "message": "Recording started successfully"
}
```

**Stop Recording**:
```typescript
{
  "tool": "browser_video_overlay_control",
  "arguments": {
    "action": "stop"
  }
}
```

**Response**:
```json
{
  "success": true,
  "previousState": "recording",
  "currentState": "stopped",
  "videoPath": "/output/recording-2025-11-29T10-30-00.webm",
  "duration": 45.3,
  "message": "Recording stopped. Video saved to /output/recording-2025-11-29T10-30-00.webm"
}
```

### 3. Query Recording Status

Check current recording state at any time:

```typescript
{
  "tool": "browser_video_overlay_status",
  "arguments": {}
}
```

**Response (during recording)**:
```json
{
  "overlayEnabled": true,
  "overlayPosition": "top-right",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "state": "recording",
  "elapsedTime": 12.5,
  "startTime": "2025-11-29T10:30:00.000Z",
  "stopTime": null,
  "videoPath": null,
  "videoMetadata": null
}
```

**Response (after stopped)**:
```json
{
  "overlayEnabled": true,
  "overlayPosition": "top-right",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "state": "stopped",
  "elapsedTime": 45.3,
  "startTime": "2025-11-29T10:30:00.000Z",
  "stopTime": "2025-11-29T10:30:45.300Z",
  "videoPath": "/output/recording-2025-11-29T10-30-00.webm",
  "videoMetadata": {
    "format": "webm",
    "duration": 45.3,
    "resolution": {
      "width": 1280,
      "height": 720
    },
    "fileSize": 2457600
  }
}
```

---

## Configuration

### Overlay Position

Position the overlay in any corner to avoid interfering with page content:

```typescript
// Top-right (default) - least likely to obstruct page content
{
  "tool": "browser_video_overlay_enable",
  "arguments": {
    "position": "top-right"
  }
}

// Bottom-left - useful if page has top-right notifications
{
  "tool": "browser_video_overlay_enable",
  "arguments": {
    "position": "bottom-left"
  }
}
```

**Available Positions**:
- `"top-left"` - Upper left corner
- `"top-right"` - Upper right corner (default)
- `"bottom-left"` - Lower left corner
- `"bottom-right"` - Lower right corner

### Auto-Start Recording

Automatically start recording when overlay is enabled (useful for automation):

```typescript
{
  "tool": "browser_video_overlay_enable",
  "arguments": {
    "position": "top-right",
    "autoStart": true  // Recording starts immediately
  }
}
```

**Response**:
```json
{
  "success": true,
  "sessionId": "660e8400-e29b-41d4-a716-446655440001",
  "overlayPosition": "top-right",
  "recordingStarted": true  // Indicates auto-start occurred
}
```

With `autoStart: true`, you don't need a separate `browser_video_overlay_control` call to begin recording.

---

## Headless Mode

### How It Works

In headless mode (no visible browser window):
- Overlay HTML/CSS is injected but not rendered visually
- All MCP tool controls work identically to headed mode
- Status queries return the same data structure
- Videos are captured and saved normally

**Key Point**: The overlay exists in the DOM but isn't visible. This is intentional - same code path for headed and headless reduces complexity and testing surface area.

### Usage Example

```bash
# Launch browser in headless mode
playwright launch --headless

# Enable overlay (invisible but functional)
{
  "tool": "browser_video_overlay_enable",
  "arguments": {}
}

# Control recording via API (no visual buttons)
{
  "tool": "browser_video_overlay_control",
  "arguments": {
    "action": "record"
  }
}

# ... perform automation ...

# Stop recording
{
  "tool": "browser_video_overlay_control",
  "arguments": {
    "action": "stop"
  }
}

# Video saved to filesystem as normal
```

### CI/CD Integration

Headless mode is ideal for continuous integration environments:

```yaml
# .github/workflows/test.yml
steps:
  - name: Run browser automation with recording
    run: |
      # Start headless browser with overlay enabled
      npm run test:headless -- --enable-overlay
      # Videos saved to ./test-results/videos/
```

---

## Video Output

### File Location

Videos are saved to the configured output directory:

**Default Location**: `./playwright-videos/`

**Custom Location** (via browser context options):
```typescript
const context = await browser.newContext({
  recordVideo: {
    dir: '/path/to/custom/output',
    size: { width: 1280, height: 720 }
  }
});
```

### File Naming

Videos use timestamp-based naming:

**Format**: `recording-{ISO-timestamp}.webm`

**Example**: `recording-2025-11-29T10-30-00.webm`

### Accessing Videos

**After Stop**:
The `browser_video_overlay_control` tool (with `action: "stop"`) returns the absolute file path:

```json
{
  "success": true,
  "videoPath": "/home/user/project/playwright-videos/recording-2025-11-29T10-30-00.webm",
  "duration": 45.3
}
```

**Via Status Query**:
Once recording is stopped, `browser_video_overlay_status` includes video metadata:

```json
{
  "state": "stopped",
  "videoPath": "/home/user/project/playwright-videos/recording-2025-11-29T10-30-00.webm",
  "videoMetadata": {
    "format": "webm",
    "duration": 45.3,
    "resolution": { "width": 1280, "height": 720 },
    "fileSize": 2457600
  }
}
```

### Video Format

**Native Format**: WebM (Playwright default)
- Efficient encoding, good compression
- Widely supported (Chrome, Firefox, VLC)
- Suitable for most automation use cases

**Conversion to MP4** (if needed):
Use the existing `browser_video_convert` tool:

```typescript
{
  "tool": "browser_video_convert",
  "arguments": {
    "inputPath": "/path/to/recording.webm",
    "outputPath": "/path/to/recording.mp4",
    "format": "mp4"
  }
}
```

---

## Troubleshooting

### Overlay Not Visible

**Symptom**: Overlay doesn't appear in browser after `browser_video_overlay_enable`

**Possible Causes**:

1. **Overlay Already Enabled**
   - Error: `OVERLAY_ALREADY_ENABLED`
   - Solution: Check status with `browser_video_overlay_status`. If overlay is already enabled, use `browser_video_overlay_control` instead.

2. **Browser Context Closed**
   - Error: `CONTEXT_CLOSED`
   - Solution: Create a new browser context before enabling overlay.

3. **Page Not Loaded**
   - Overlay injection waits for `DOMContentLoaded` event
   - Solution: Navigate to a page first (e.g., `browser_navigate` to `https://example.com`)

4. **Headless Mode**
   - Overlay exists but is invisible (expected behavior)
   - Verification: Use `browser_video_overlay_status` to confirm `overlayEnabled: true`

### Recording Not Starting

**Symptom**: Calling `browser_video_overlay_control` with `action: "record"` fails

**Possible Causes**:

1. **Overlay Not Enabled**
   - Error: `OVERLAY_NOT_ENABLED`
   - Solution: Call `browser_video_overlay_enable` first

2. **Recording Already Active**
   - Error: `RECORDING_ALREADY_ACTIVE`
   - Solution: Stop current recording with `action: "stop"` before starting new one

3. **Invalid State Transition**
   - Error: `INVALID_STATE_TRANSITION`
   - Example: Trying to pause when state is `"idle"`
   - Solution: Check current state with `browser_video_overlay_status` first

### Pause/Resume Behavior

**Important**: Playwright does not support native pause/resume for video recording.

**How It Works**:
- **Pause** (`action: "pause"`): Stops current recording and saves video file
- **Resume** (`action: "resume"`): Starts **new** recording (creates new video file)

**Result**: Multiple video files instead of single continuous recording.

**Workaround** (if single file needed):
1. Record continuously without pausing
2. Use `browser_video_convert` to trim unwanted sections post-recording
3. Or use FFmpeg externally to merge multiple video segments

**Example**:
```typescript
// Start recording
{ "tool": "browser_video_overlay_control", "arguments": { "action": "record" } }
// Response: recording-part1.webm

// Pause (actually stops and saves)
{ "tool": "browser_video_overlay_control", "arguments": { "action": "pause" } }
// Response: "Recording paused (stopped). Resume will start new recording."
// Video saved: recording-part1.webm

// Resume (starts new recording)
{ "tool": "browser_video_overlay_control", "arguments": { "action": "resume" } }
// New video file: recording-part2.webm
```

### Video File Not Found

**Symptom**: `videoPath` returned but file doesn't exist

**Possible Causes**:

1. **Premature File Access**
   - Video finalization takes time (up to 5 seconds per spec SC-001)
   - Solution: Wait 5 seconds after stop before accessing file

2. **Insufficient Disk Space**
   - Recording may fail silently if disk is full
   - Solution: Check disk space, verify output directory is writable

3. **Incorrect File Path**
   - Path returned is relative, not absolute
   - Solution: Use absolute paths by configuring `recordVideo.dir` with absolute path

### Performance Issues

**Symptom**: Browser slows down during recording

**Possible Causes**:

1. **High Resolution Recording**
   - Recording at 4K can impact performance
   - Solution: Reduce resolution in browser context options:
     ```typescript
     recordVideo: {
       size: { width: 1280, height: 720 }  // 720p instead of 1080p/4K
     }
     ```

2. **Long Recording Duration**
   - Recordings >10 minutes may accumulate large buffers
   - Solution: Stop and restart recording periodically (creates multiple files)

3. **CPU-Intensive Page**
   - Recording adds 2% overhead, compounded with heavy page rendering
   - Solution: Reduce browser headless=true for lower overhead, or disable recording for performance-critical sections

### Invalid State Transitions

**Symptom**: `INVALID_STATE_TRANSITION` error

**State Machine Rules**:

**Valid Transitions**:
```
idle → recording        (action: "record")
recording → stopped     (action: "stop")
recording → stopped     (action: "pause")
stopped → recording     (action: "resume")
```

**Invalid Transitions** (cause errors):
```
idle → stopped          ❌ Cannot stop before starting
stopped → recording     ❌ Cannot restart stopped session (use "resume" or create new session)
```

**Solution**: Always check current state with `browser_video_overlay_status` before attempting control actions.

---

## Advanced Scenarios

### LLM-Driven Automation with Visual Verification

**Use Case**: LLM performs browser automation and wants video evidence of success/failure

```typescript
// 1. Enable overlay with auto-start
{
  "tool": "browser_video_overlay_enable",
  "arguments": {
    "autoStart": true
  }
}

// 2. Perform automation (e.g., fill form, click buttons)
{
  "tool": "browser_click",
  "arguments": { "element": "Submit button", "ref": "..." }
}

// 3. Check for visual errors (LLM reviews status)
{
  "tool": "browser_video_overlay_status",
  "arguments": {}
}

// 4. Stop recording and retrieve video for analysis
{
  "tool": "browser_video_overlay_control",
  "arguments": {
    "action": "stop"
  }
}
// Response includes videoPath for LLM to reference
```

### Multiple Recording Sessions

**Scenario**: Record different sections of automation separately

```typescript
// Session 1: Login flow
await enableOverlay();
await controlRecording({ action: "record" });
// ... perform login ...
await controlRecording({ action: "stop" });
// Video: login-flow.webm

// Session 2: Checkout flow
await controlRecording({ action: "record" });
// ... perform checkout ...
await controlRecording({ action: "stop" });
// Video: checkout-flow.webm
```

**Note**: Each session creates a unique `sessionId`. Overlay stays enabled across sessions.

---

## Reference

### State Lifecycle

```
┌─────────────────────────────────────────────────────────┐
│ Overlay Lifecycle                                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [Not Enabled]                                          │
│       │                                                 │
│       ├─→ browser_video_overlay_enable()                │
│       │                                                 │
│  [Overlay Enabled, State: idle]                         │
│       │                                                 │
│       ├─→ browser_video_overlay_control(action: "record")│
│       │                                                 │
│  [Overlay Enabled, State: recording]                    │
│       │                                                 │
│       ├─→ browser_video_overlay_control(action: "pause")│
│       │   (stops recording, saves video)                │
│       │                                                 │
│  [Overlay Enabled, State: stopped]                      │
│       │                                                 │
│       ├─→ browser_video_overlay_control(action: "resume")│
│       │   (starts NEW recording)                        │
│       │                                                 │
│  [Overlay Enabled, State: recording]                    │
│       │                                                 │
│       └─→ browser_video_overlay_control(action: "stop") │
│           (finalizes video, saves to disk)              │
│                                                         │
│  [Overlay Enabled, State: stopped]                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Quick Reference: Tool Signatures

```typescript
// Enable overlay
browser_video_overlay_enable(
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right",
  autoStart?: boolean
): {
  success: boolean;
  sessionId: string;
  overlayPosition: string;
  recordingStarted: boolean;
}

// Control recording
browser_video_overlay_control(
  action: "record" | "pause" | "resume" | "stop"
): {
  success: boolean;
  previousState: "idle" | "recording" | "stopped";
  currentState: "idle" | "recording" | "stopped";
  videoPath: string | null;
  duration: number | null;
  message: string;
}

// Query status
browser_video_overlay_status(): {
  overlayEnabled: boolean;
  overlayPosition: string;
  sessionId: string;
  state: "idle" | "recording" | "stopped";
  elapsedTime: number;
  startTime: string | null;
  stopTime: string | null;
  videoPath: string | null;
  videoMetadata: {
    format: "webm" | "mp4";
    duration: number;
    resolution: { width: number; height: number };
    fileSize: number;
  } | null;
}
```

---

## Related Documentation

- **Feature Spec**: `specs/001-video-recording-controls/spec.md`
- **Data Model**: `specs/001-video-recording-controls/data-model.md`
- **Research Decisions**: `specs/001-video-recording-controls/research.md`
- **MCP Tool Contracts**: `specs/001-video-recording-controls/contracts/`
- **Existing Video Tools**: See main README for `browser_video_start`, `browser_video_stop`, etc.

---

**Last Updated**: 2025-11-29 | **Feature Version**: 001-video-recording-controls
