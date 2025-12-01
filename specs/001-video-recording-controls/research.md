# Research: Browser Overlay Recording Controls

**Feature**: 001-video-recording-controls
**Date**: 2025-11-29
**Purpose**: Resolve technical unknowns before implementation

---

## Research Task 1: Overlay Injection Mechanism

### Question
How to inject persistent HTML/CSS overlay into Playwright browser pages that survives navigation?

### Options Evaluated

**Option A: `page.addInitScript()`**
- **Pros**: Automatically re-runs on every page load/navigation, perfect for persistence
- **Cons**: Script must be idempotent, may execute multiple times per page
- **Use Case**: Ideal for injecting overlay HTML/CSS before page content loads

**Option B: `page.evaluate()` on each navigation**
- **Pros**: Fine-grained control, explicit injection points
- **Cons**: Requires listening to navigation events, overlay may flash/disappear during navigation
- **Use Case**: Better for one-time operations, not persistent overlays

**Option C: Browser Extension Approach**
- **Pros**: True persistence, access to all browser APIs
- **Cons**: Requires extension packaging, installation complexity, not compatible with headless easily
- **Use Case**: Overkill for this feature

### Decision: `page.addInitScript()`

**Rationale**:
- Playwright's `page.addInitScript()` is designed exactly for this use case - injecting scripts that persist across navigations
- Executes before any page content loads, ensuring overlay appears immediately
- Works in both headed and headless modes
- No need to track navigation events manually

**Implementation Pattern**:
```typescript
await page.addInitScript(() => {
  // Check if overlay already exists to avoid duplicates
  if (!document.getElementById('playwright-recording-overlay')) {
    const overlay = document.createElement('div');
    overlay.id = 'playwright-recording-overlay';
    overlay.innerHTML = `/* overlay HTML template */`;
    document.addEventListener('DOMContentLoaded', () => {
      document.body.appendChild(overlay);
    });
  }
});
```

**Alternatives Considered**:
- `context.addInitScript()` - Would apply to all pages in context (considered but page-level gives more control)
- Manual navigation event listeners - Rejected due to complexity and flash issues

---

## Research Task 2: Video Pause/Resume Implementation

### Question
Can Playwright's `recordVideo` be paused/resumed natively, or do we need a workaround?

### Investigation Results

**Playwright Video Recording API Analysis**:
- `BrowserContext.recordVideo` option: Starts recording when context is created
- **No native pause/resume API exists** in Playwright 1.53.0
- Recording stops only when context closes (triggers video finalization)
- Video is written incrementally to a `.webm` file

**Evidence**:
```typescript
// From Playwright docs and source code review:
interface BrowserContextOptions {
  recordVideo?: {
    dir: string;
    size?: { width: number; height: number };
  };
}
// No pause(), resume(), or similar methods on BrowserContext
```

### Options Evaluated

**Option A: Stop/Restart with Video Merging**
- **Approach**: Stop recording (close context), start new recording (new context), merge videos with FFmpeg
- **Pros**: Works with current Playwright API
- **Cons**: Creates multiple video files, requires FFmpeg, context recreation disrupts browser state
- **Complexity**: High

**Option B: Client-Side Frame Dropping**
- **Approach**: Let Playwright record continuously, use client-side script to blank/freeze frames during "pause"
- **Pros**: Single video file, no context recreation
- **Cons**: Hacky, wasted disk space, may not work reliably
- **Complexity**: Medium, unreliable

**Option C: Implement Pause as "Keep Recording, Mark Timestamps"**
- **Approach**: Record continuously, track pause intervals in metadata, provide video editing guidance post-recording
- **Pros**: Simplest, no video manipulation during recording
- **Cons**: Full video file includes "paused" sections (user must trim later)
- **Complexity**: Low

**Option D: Accept Limitation - No True Pause (Recommended)**
- **Approach**: "Pause" stops and finalizes current recording, "Resume" starts a new recording
- **Pros**: Matches Playwright's capabilities, clear user expectation (pause = stop recording)
- **Cons**: User can't resume same recording, gets multiple video files
- **Complexity**: Very Low

### Decision: Option D - No True Pause

**Rationale**:
- Playwright doesn't support pause/resume - working around this adds significant complexity
- For MVP (P2 priority), "pause" can simply mean "stop current recording"
- If user wants to resume, they start a new recording (new video file)
- Aligns with existing `browser_video_start` and `browser_video_stop` semantics
- Can revisit video merging in future if user feedback demands true pause/resume

**Implementation**:
- "Pause" button → calls `browser_video_stop` → finalizes current video
- "Resume" button → calls `browser_video_start` → starts new recording (new file)
- Overlay UI indicates "pause" results in new recording when resumed

**Alternatives Considered**:
- FFmpeg merging approach - Rejected due to complexity and external dependency concerns
- Frame dropping - Rejected due to unreliability and hacky nature

**Future Enhancement**:
If true pause/resume is critical, implement video segment merging:
1. On pause: stop recording, save video segment
2. On resume: start new recording
3. On final stop: merge all segments with FFmpeg
4. Requires: FFmpeg dependency, segment management logic

---

## Research Task 3: Overlay → Backend Communication

### Question
How do MCP tool calls (in Node.js backend) trigger overlay state changes in the browser (JavaScript)?

### Architecture Analysis

**Communication Flow**:
```
MCP Client → MCP Server (Node.js) → Playwright Page API → Browser JavaScript (Overlay)
```

### Options Evaluated

**Option A: `page.evaluate()` Direct Manipulation**
- **Approach**: MCP tool uses `page.evaluate()` to update overlay DOM/state
- **Pros**: Simple, synchronous, no additional infrastructure
- **Cons**: Requires page reference in tool context
- **Pattern**: `await page.evaluate(() => { updateOverlayState('recording'); })`

**Option B: WebSocket Channel**
- **Approach**: Open WebSocket between backend and browser overlay
- **Pros**: Bidirectional, real-time updates
- **Cons**: Overkill, requires WebSocket server, complicates architecture
- **Pattern**: Complex infrastructure for simple state updates

**Option C: Polling from Overlay**
- **Approach**: Overlay polls backend for state changes
- **Pros**: Simple from backend perspective
- **Cons**: Latency, unnecessary network calls, inefficient
- **Pattern**: Rejected due to performance concerns

### Decision: `page.evaluate()` Direct Manipulation

**Rationale**:
- MCP tools already have access to `Context` which provides page access
- `page.evaluate()` is Playwright's standard method for executing code in browser context
- Synchronous execution ensures state changes happen immediately
- No additional infrastructure needed (no servers, no polling)

**Implementation Pattern**:
```typescript
// In MCP tool handler:
const action = async () => {
  const tab = await context.ensureTab();
  await tab.page.evaluate((actionType) => {
    const overlay = document.getElementById('playwright-recording-overlay');
    if (overlay) {
      // Update overlay visual state
      overlay.dataset.state = actionType; // 'recording', 'paused', 'stopped'
      // Update button UI
      const recordBtn = overlay.querySelector('.record-btn');
      recordBtn.classList.toggle('active', actionType === 'recording');
    }
  }, params.action);
};
```

**Alternatives Considered**:
- WebSocket - Rejected as overcomplicated for one-way communication
- CDP (Chrome DevTools Protocol) - Rejected, `page.evaluate()` is higher-level abstraction

---

## Research Task 4: State Management Architecture

### Question
Where should recording session state (recording/paused/stopped) be stored?

### Options Evaluated

**Option A: Global State in `src/tools/video.ts`** (Current Pattern)
- **Current Implementation**: `videoRecordingState` global variable
- **Pros**: Already established pattern, simple access from all video tools
- **Cons**: Not ideal for multiple contexts (though spec limits to single context), global mutable state

**Option B: `Context` Instance Property**
- **Approach**: Store state as `context.recordingSession`
- **Pros**: Encapsulated with context lifecycle, cleaner architecture
- **Cons**: Requires modifying `Context` class, breaks existing video tool pattern

**Option C: Separate State Manager Class**
- **Approach**: Create `RecordingSessionManager` singleton
- **Pros**: Proper OOP, testable, clear separation of concerns
- **Cons**: Over-engineering for simple state needs, adds complexity

### Decision: Global State in `src/tools/video.ts` (Existing Pattern)

**Rationale**:
- Existing video tools (`browser_video_start`, `browser_video_stop`) already use global `videoRecordingState`
- Consistency with established codebase patterns reduces cognitive load
- Spec explicitly limits to single browser context per recording (global state is sufficient)
- Simple to extend with overlay-specific fields (add `overlayEnabled`, `overlayPosition`)

**Implementation**:
```typescript
// Extend existing videoRecordingState in src/tools/video.ts
let videoRecordingState: {
  isRecording: boolean;
  startTime?: Date;
  filename?: string;
  config?: any;
  videoPath?: string;
  browserContext?: playwright.BrowserContext;
  // NEW overlay-specific fields:
  overlayEnabled: boolean;
  overlayPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  overlayState: 'idle' | 'recording' | 'paused' | 'stopped';
} = {
  isRecording: false,
  overlayEnabled: false,
  overlayPosition: 'top-right',
  overlayState: 'idle'
};
```

**Alternatives Considered**:
- Context property - Rejected to maintain consistency with existing tools
- State manager class - Rejected as over-engineering for current needs

---

## Research Task 5: Headless Mode Behavior

### Question
How do overlay controls work when browser is headless (no visible UI)?

### Investigation

**Playwright Headless Mode Capabilities**:
- `page.evaluate()` **DOES work** in headless mode (verified in Playwright docs)
- DOM manipulation succeeds even without rendering
- Scripts execute normally, just no visual display

**Testing Evidence**:
```typescript
// This works in headless mode:
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.evaluate(() => {
  const div = document.createElement('div');
  div.id = 'test';
  document.body.appendChild(div);
  return document.getElementById('test') !== null; // Returns true
});
```

### Options Evaluated

**Option A: Same Injection, Just Invisible**
- **Approach**: Inject overlay HTML/CSS in headless mode (it exists but isn't rendered)
- **Pros**: No code branches, same implementation for headed/headless
- **Cons**: Wasted overhead injecting invisible elements
- **Works**: Yes

**Option B: Skip Overlay Injection in Headless**
- **Approach**: Detect headless mode, don't inject overlay, only maintain state
- **Pros**: Slight performance improvement
- **Cons**: Code branching, different behavior, complicates testing
- **Works**: Yes

**Option C: Overlay Injection with Headless Flag**
- **Approach**: Inject minimal overlay in headless (just state tracking, no visual elements)
- **Pros**: Balance between performance and code consistency
- **Cons**: Still requires branching logic

### Decision: Option A - Same Injection, Just Invisible

**Rationale**:
- Simplest implementation - no conditional logic based on headless detection
- Overlay injection is lightweight (just HTML/CSS/JS), overhead is negligible
- Testing is simpler (same code path for headed and headless)
- `page.evaluate()` calls for state updates work identically in both modes
- User documentation is clearer ("overlay works in headless, you just can't see it")

**Implementation**:
```typescript
// No headless detection needed:
async function enableRecordingOverlay(context, position) {
  const tab = await context.ensureTab();
  await tab.page.addInitScript((pos) => {
    // Same injection logic for headed and headless
    const overlay = createOverlayElement(pos);
    document.addEventListener('DOMContentLoaded', () => {
      document.body.appendChild(overlay);
    });
  }, position);
}
```

**Headless Mode Documentation**:
- Overlay controls function normally via MCP tools in headless mode
- Visual overlay is not displayed, but state tracking and controls work
- Useful for CI/CD environments where no display is available
- Status queries and video output work identically to headed mode

**Alternatives Considered**:
- Headless detection and skipping injection - Rejected due to code complexity
- Minimal overlay in headless - Rejected as premature optimization

---

## Summary of Decisions

| Research Area | Decision | Implementation Complexity | Risk Level |
|---------------|----------|---------------------------|------------|
| Overlay Injection | `page.addInitScript()` | Low - single API call | Low |
| Pause/Resume | No true pause (stop/start new) | Low - use existing tools | Medium (UX) |
| Backend → Overlay Communication | `page.evaluate()` direct manipulation | Low - standard Playwright API | Low |
| State Management | Global state in `video.ts` | Very Low - extend existing | Low |
| Headless Mode | Same injection, invisible overlay | Low - no conditional logic | Low |

**Overall Implementation Risk**: **LOW**

**Key Insights**:
1. Playwright's existing APIs (`addInitScript`, `page.evaluate()`) handle most requirements without workarounds
2. Pause/resume limitation is acceptable for MVP - can enhance later if needed
3. Consistency with existing codebase patterns (global state) reduces integration risk
4. Headless mode "just works" with no special handling required

---

## Follow-up Recommendations

1. **Phase 1**: Proceed with data model design using these decisions
2. **Prototype**: Create minimal overlay HTML/CSS template to validate `addInitScript` persistence
3. **Testing**: Verify `page.evaluate()` performance for state updates (<500ms target)
4. **Documentation**: Clearly document pause/resume behavior (creates new video file)
5. **Future Enhancement**: If users demand true pause/resume, implement video segment merging with FFmpeg

---

## References

- [Playwright `page.addInitScript()` docs](https://playwright.dev/docs/api/class-page#page-add-init-script)
- [Playwright `page.evaluate()` docs](https://playwright.dev/docs/api/class-page#page-evaluate)
- [Playwright Video Recording docs](https://playwright.dev/docs/api/class-browsercontext#browser-context-option-record-video)
- Existing implementation: `src/tools/video.ts` lines 56-66 (videoRecordingState)
