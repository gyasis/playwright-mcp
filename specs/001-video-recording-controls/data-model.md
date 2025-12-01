# Data Model: Browser Overlay Recording Controls

**Feature**: 001-video-recording-controls
**Date**: 2025-11-29
**Input**: Entities from spec.md + research decisions from research.md

---

## Entity Overview

This feature manages recording sessions with overlay controls. The data model tracks recording state, overlay configuration, and video output metadata.

**Core Entities**:
1. RecordingSession - Manages recording lifecycle and state
2. OverlayConfiguration - Controls overlay appearance and behavior
3. VideoMetadata - Describes output video files

---

## Entity 1: RecordingSession

**Purpose**: Represents an active or completed recording session, tracking state transitions and timing information.

### Attributes

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `sessionId` | `string` (UUID) | Yes | Generated | Unique identifier for recording session |
| `state` | `enum` | Yes | `"idle"` | Current recording state |
| `startTime` | `Date \| null` | No | `null` | When recording started (null if not started) |
| `stopTime` | `Date \| null` | No | `null` | When recording stopped (null if still recording) |
| `videoPath` | `string \| null` | No | `null` | File path to saved video (null until stopped) |
| `browserContext` | `object` | No | `null` | Reference to Playwright BrowserContext |
| `overlayEnabled` | `boolean` | Yes | `false` | Whether overlay controls are active |

### State Enum

```typescript
type RecordingState =
  | "idle"       // No recording active, ready to start
  | "recording"  // Currently capturing video
  | "stopped";   // Recording completed, video finalized
```

**Note**: "paused" state removed per research decision - pause stops current recording.

### State Machine

**Valid Transitions**:
```
idle → recording        (on browser_video_overlay_control action: "record")
recording → stopped     (on browser_video_overlay_control action: "stop")
stopped → idle          (on new session start)
```

**Invalid Transitions** (throw `Error`):
```
idle → stopped          (cannot stop before starting)
stopped → recording     (cannot resume stopped session - must create new)
```

### State Transition Rules

1. **idle → recording**:
   - Triggered by: `browser_video_overlay_control({action: "record"})`
   - Prerequisites: No active recording exists
   - Side effects: Sets `startTime`, creates video file, updates overlay UI
   - Validation: Must have `overlayEnabled === true`

2. **recording → stopped**:
   - Triggered by: `browser_video_overlay_control({action: "stop"})`
   - Prerequisites: Recording is active
   - Side effects: Finalizes video file, sets `videoPath` and `stopTime`, updates overlay UI
   - Cleanup: Releases resources, closes browser context if needed

3. **stopped → idle**:
   - Triggered by: New `browser_video_overlay_enable()` call
   - Prerequisites: Previous session must be stopped
   - Side effects: Resets session state, clears video metadata
   - Validation: Cannot reuse stopped session - must create new

### Validation Rules

| Rule | Validation | Error Message |
|------|------------|---------------|
| Single Active Recording | Only one session can be in "recording" state | "Recording already in progress. Stop current recording before starting new one." |
| Valid State Transitions | State changes must follow state machine | "Invalid state transition: {current} → {requested}" |
| Overlay Required | Cannot record without overlay enabled | "Overlay must be enabled before starting recording" |
| Video Path | `videoPath` must be null while recording | "Video path cannot be set until recording stops" |

### Example Instance

```typescript
const session: RecordingSession = {
  sessionId: "550e8400-e29b-41d4-a716-446655440000",
  state: "recording",
  startTime: new Date("2025-11-29T10:30:00Z"),
  stopTime: null,
  videoPath: null,
  browserContext: /* Playwright context object */,
  overlayEnabled: true
};
```

---

## Entity 2: OverlayConfiguration

**Purpose**: Defines how the recording overlay appears and behaves in the browser.

### Attributes

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `position` | `enum` | Yes | `"top-right"` | Overlay screen position |
| `visible` | `boolean` | Yes | `true` | Whether overlay is visible (always true unless explicitly hidden) |
| `currentState` | `enum` | Yes | `"idle"` | Visual state displayed to user (matches RecordingSession.state) |
| `autoStart` | `boolean` | Yes | `false` | Automatically start recording when overlay enabled |

### Position Enum

```typescript
type OverlayPosition =
  | "top-left"
  | "top-right"    // Default - least likely to interfere with page content
  | "bottom-left"
  | "bottom-right";
```

### Visual States

```typescript
type OverlayVisualState =
  | "idle"       // Gray record button, stop button disabled
  | "recording"  // Red record button, stop button enabled
  | "stopped";   // All buttons disabled, shows "Recording saved"
```

### Styling Guidelines

**Overlay Requirements** (from Spec SC-007):
- Must not obscure critical browser UI (address bar, navigation controls)
- Positioned in corner with configurable location
- Minimal footprint: ~100x40px
- Semi-transparent background for visibility without obstruction
- Responsive to window resizing (stays in configured corner)

### Example Instance

```typescript
const overlayConfig: OverlayConfiguration = {
  position: "top-right",
  visible: true,
  currentState: "recording",
  autoStart: false
};
```

---

## Entity 3: VideoMetadata

**Purpose**: Describes properties of the recorded video file output.

### Attributes

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `filePath` | `string` | Yes | Generated | Absolute path to video file |
| `format` | `enum` | Yes | `"webm"` | Video file format |
| `duration` | `number` | Yes | Calculated | Recording duration in seconds |
| `resolution` | `object` | Yes | From config | Video dimensions |
| `fps` | `number` | Yes | `~15-30` | Frames per second (Playwright default) |
| `fileSize` | `number` | No | Calculated | File size in bytes (available after stop) |
| `createdAt` | `Date` | Yes | Timestamp | When video file was created |

### Format Enum

```typescript
type VideoFormat =
  | "webm"  // Default Playwright format
  | "mp4";  // Available via conversion tool
```

### Resolution Object

```typescript
interface VideoResolution {
  width: number;   // Pixels (e.g., 1280)
  height: number;  // Pixels (e.g., 720)
}
```

### Calculation Rules

| Field | Calculation | Source |
|-------|-------------|--------|
| `duration` | `stopTime - startTime` (in seconds) | RecordingSession timestamps |
| `filePath` | `outputDir + '/recording-' + timestamp + '.webm'` | Config + timestamp |
| `fileSize` | `fs.stat(filePath).size` | Filesystem after finalization |
| `fps` | Set by Playwright (typically 15-30) | Playwright recordVideo defaults |

### Example Instance

```typescript
const videoMetadata: VideoMetadata = {
  filePath: "/output/recording-2025-11-29T10-30-00.webm",
  format: "webm",
  duration: 45.3,  // 45.3 seconds
  resolution: { width: 1280, height: 720 },
  fps: 25,
  fileSize: 2_457_600,  // ~2.4MB
  createdAt: new Date("2025-11-29T10:30:00Z")
};
```

---

## Relationships

### RecordingSession ↔ OverlayConfiguration

**Relationship**: One-to-one
**Cardinality**: 1 RecordingSession has 1 OverlayConfiguration
**Integrity**: OverlayConfiguration created when `browser_video_overlay_enable()` called
**Lifecycle**: Both created together, overlay persists across session resets

### RecordingSession → VideoMetadata

**Relationship**: One-to-one (after completion)
**Cardinality**: 1 RecordingSession produces 1 VideoMetadata (when stopped)
**Integrity**: VideoMetadata created only when `state` transitions to `"stopped"`
**Lifecycle**: VideoMetadata persists after RecordingSession is reset for new recording

### Global State Structure

Based on research decision to use global state in `src/tools/video.ts`:

```typescript
let videoRecordingState: {
  // Existing fields (from current implementation):
  isRecording: boolean;
  startTime?: Date;
  filename?: string;
  config?: any;
  videoPath?: string;
  browserContext?: playwright.BrowserContext;

  // NEW fields for overlay controls:
  session: RecordingSession;
  overlay: OverlayConfiguration;
  videoMetadata?: VideoMetadata;  // Set when recording stops
} = {
  isRecording: false,
  session: {
    sessionId: crypto.randomUUID(),
    state: "idle",
    startTime: null,
    stopTime: null,
    videoPath: null,
    browserContext: null,
    overlayEnabled: false
  },
  overlay: {
    position: "top-right",
    visible: false,
    currentState: "idle",
    autoStart: false
  }
};
```

---

## Data Constraints

### Business Rules

1. **Single Recording Constraint**: Only one recording can be in "recording" state at any time
2. **Overlay Required**: Recording cannot start if `overlayEnabled === false`
3. **Immutable After Stop**: Once `state === "stopped"`, session cannot be restarted (must create new)
4. **Video Path Availability**: `videoPath` only available when `state === "stopped"`
5. **Metadata Completeness**: VideoMetadata must have all required fields before returning to client

### Technical Constraints

1. **Session ID Uniqueness**: `sessionId` must be unique UUID (generated via `crypto.randomUUID()`)
2. **File Path Validity**: `videoPath` must be absolute path, file must exist
3. **Duration Positive**: `duration` must be > 0 (cannot record 0-second videos)
4. **Resolution Bounds**: `width` [100-3840], `height` [100-2160] (Playwright limits)
5. **State Synchronization**: `RecordingSession.state` must match `OverlayConfiguration.currentState`

### Data Integrity Checks

```typescript
// Validation functions:
function validateStateTransition(current: RecordingState, next: RecordingState): void {
  const validTransitions = {
    idle: ["recording"],
    recording: ["stopped"],
    stopped: ["idle"]
  };

  if (!validTransitions[current].includes(next)) {
    throw new Error(`Invalid state transition: ${current} → ${next}`);
  }
}

function validateSingleRecording(): void {
  if (videoRecordingState.isRecording &&
      videoRecordingState.session.state === "recording") {
    throw new Error("Recording already in progress");
  }
}

function validateOverlayEnabled(): void {
  if (!videoRecordingState.session.overlayEnabled) {
    throw new Error("Overlay must be enabled before recording");
  }
}
```

---

## Storage & Persistence

### In-Memory State

**Storage**: Global variable in `src/tools/video.ts` (per research decision)
**Lifetime**: Persists for duration of MCP server process
**Reset Conditions**:
- Server restart
- Manual reset via new session creation
- Browser context closure (cleanup)

### File System

**Video Files**:
- **Location**: Configurable output directory (default: `./playwright-videos/`)
- **Naming**: `recording-{ISO-timestamp}.webm`
- **Retention**: Not automatically deleted (user responsibility)
- **Access**: File path returned to MCP client after recording stops

**No Database**: This feature uses in-memory state only. Video files are the only persistent artifacts.

---

## Error States

### Error Scenarios

| Scenario | Detected By | Error Message | Recovery |
|----------|-------------|---------------|----------|
| Invalid state transition | State validation | "Invalid state transition: {from} → {to}" | Retry with valid state |
| Multiple recordings | Recording start validation | "Recording already in progress" | Stop current recording first |
| Overlay not enabled | Recording start validation | "Overlay must be enabled" | Call `browser_video_overlay_enable()` |
| Video file not found | Stop validation | "Video file not created: {path}" | Check disk space, retry |
| Browser context closed | Recording stop | "Cannot stop recording: context closed" | Session lost, create new |

### Error Recovery Patterns

1. **Graceful Degradation**: If overlay injection fails, fall back to API-only control (no visual overlay)
2. **Partial Recording Save**: If stop fails, attempt to save partial recording (best effort)
3. **State Reset**: On critical errors, reset session to `"idle"` to allow recovery

---

## Testing Considerations

### State Machine Tests

Test all valid and invalid transitions:
```typescript
test('valid transition: idle → recording', () => {
  const session = createSession();
  session.state = 'idle';
  transitionTo(session, 'recording');  // Should succeed
  expect(session.state).toBe('recording');
});

test('invalid transition: idle → stopped', () => {
  const session = createSession();
  session.state = 'idle';
  expect(() => transitionTo(session, 'stopped')).toThrow('Invalid state transition');
});
```

### Data Integrity Tests

Verify constraints:
```typescript
test('video metadata has all required fields when stopped', async () => {
  const session = await startRecording();
  const metadata = await stopRecording(session);

  expect(metadata.filePath).toBeDefined();
  expect(metadata.duration).toBeGreaterThan(0);
  expect(metadata.fileSize).toBeGreaterThan(0);
});
```

---

## Summary

**Entities**: 3 (RecordingSession, OverlayConfiguration, VideoMetadata)
**State Machine Complexity**: Simple (3 states, 3 transitions)
**Storage**: In-memory (global state) + Filesystem (video files)
**Validation**: 5 business rules, 5 technical constraints
**Error Scenarios**: 5 identified with recovery patterns

**Key Design Principles**:
- Simple state machine (no pause state per research)
- Single source of truth (global state in video.ts)
- Immutable stopped sessions (cannot resume)
- File system for persistence (videos only)

**Next Steps**:
- Phase 1: Create MCP tool contracts based on this data model
- Phase 1: Create quickstart.md documentation
- Update Claude agent context with TypeScript types
