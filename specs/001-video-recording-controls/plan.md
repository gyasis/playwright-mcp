# Implementation Plan: Browser Overlay Recording Controls

**Branch**: `001-video-recording-controls` | **Date**: 2025-11-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-video-recording-controls/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Add browser overlay recording controls that enable LLMs to receive video feedback of browser automation actions. The feature extends existing video recording tools with visual overlay controls (record/pause/stop buttons) that can be triggered via MCP tool calls, allowing LLMs to verify automation success and detect visual errors. Priority P1 focuses on automatic video capture during tool execution, P2 adds programmatic control via overlay, P3 adds status visibility.

## Technical Context

**Language/Version**: TypeScript 5.8.2 (strict mode), Node.js 18+
**Primary Dependencies**: Playwright 1.53.0, @modelcontextprotocol/sdk ^1.11.0, Zod (for schema validation)
**Storage**: Local filesystem for video files (output directory configurable)
**Testing**: @playwright/test 1.53.0 (Chrome, Firefox, WebKit test runners)
**Target Platform**: Cross-platform (Linux, macOS, Windows) with Node.js runtime
**Project Type**: Single project - MCP server extension with tool additions
**Performance Goals**: <500ms overlay control response, 15+ FPS video capture, <5s video finalization
**Constraints**: Must work in both headed and headless modes, overlay <2% CPU overhead, video files accessible within 5s of stop
**Scale/Scope**: Single browser context per recording session, supports 10-minute recordings, existing video tool infrastructure

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. MCP Protocol Compliance ✅ PASS
- **Requirement**: All tools must return proper MCP-compliant response structures with accurate JSON schemas
- **This Feature**: New overlay control tools will use existing MCP tool infrastructure (`defineTool` from `src/tools/tool.ts`), Zod schemas for validation, standard MCP response format
- **Compliance**: Extends existing `video` capability with new tools following established patterns

### II. Accessibility-First Interaction ✅ PASS (N/A for this feature)
- **Requirement**: Prioritize accessibility tree snapshots over pixel-based approaches
- **This Feature**: Recording overlay is a visual indicator/control mechanism, not an interaction method. Does not change core accessibility-first browser automation approach
- **Compliance**: Feature is orthogonal to accessibility principle - records existing accessible interactions

### III. Testing-First Development ✅ PASS
- **Requirement**: TDD workflow - write tests first, get approval, implement, verify
- **This Feature**: Will create tests for overlay injection, MCP tool control triggering, video capture verification, pause/resume state management
- **Compliance**: Plan includes comprehensive test strategy (see Phase 1 contracts section)
- **Test Scope**: Browser-specific tests (Chrome, Firefox, WebKit) for overlay rendering, headless mode tests for API-only control

### IV. Tool Reliability & Safety ✅ PASS
- **Requirement**: Tools classified as read-only or destructive, validate inputs, clear error messages
- **This Feature**:
  - New tools: `browser_recording_overlay_control` (destructive - starts/pauses/stops recording)
  - Input validation via Zod schemas (action enum, session ID validation)
  - State machine prevents invalid transitions (can't pause if not recording, can't resume if not paused)
- **Compliance**: Follows existing video tool classification pattern, adds state validation layer

### V. Capability-Based Architecture ✅ PASS
- **Requirement**: Features organized into logical capabilities
- **This Feature**: Extends existing `video` capability (already established in constitution and codebase)
- **Tools Added**:
  - `browser_video_overlay_enable` (enable overlay for session)
  - `browser_video_overlay_control` (trigger record/pause/stop)
  - `browser_video_overlay_status` (query overlay state)
- **Compliance**: No new capability needed, fits within established `video` capability scope

### VI. Configuration Flexibility ✅ PASS
- **Requirement**: Support CLI, config file, programmatic config with clear precedence
- **This Feature**: Overlay enabled via:
  1. MCP tool parameter (highest - `enable_recording_overlay: true`)
  2. Browser context options (programmatic)
  3. Default disabled (lowest - opt-in feature)
- **Compliance**: Follows precedence hierarchy, backward compatible (default disabled)

### Security & Quality Standards ✅ PASS
- **Input Validation**: Zod schemas for all MCP tool inputs (action type, session ID format)
- **TypeScript Strict Mode**: All new code compiles under strict settings
- **Error Handling**: Explicit error handling for overlay injection failures, recording state conflicts
- **Modular Design**: New tools in `src/tools/video.ts` (existing video tools file)
- **Documentation**: LLM-friendly tool descriptions, overlay positioning docs, headless mode behavior

### Testing Requirements ✅ PASS
- **Unit Tests**: Overlay HTML/CSS generation, state machine logic, video metadata handling
- **Integration Tests**: MCP tool → overlay control → video capture → file availability
- **Browser Tests**: Cross-browser overlay rendering (Chrome, Firefox, WebKit)
- **Headless Tests**: Verify API controls work without visual overlay

**GATE RESULT**: ✅ ALL CHECKS PASSED - Proceed to Phase 0

## Project Structure

### Documentation (this feature)

```text
specs/001-video-recording-controls/
├── plan.md              # This file
├── research.md          # Phase 0 output - overlay injection patterns, pause/resume strategies
├── data-model.md        # Phase 1 output - RecordingSession entity, state machine
├── quickstart.md        # Phase 1 output - How to use overlay controls
├── contracts/           # Phase 1 output - MCP tool schemas
│   ├── overlay-enable.json
│   ├── overlay-control.json
│   └── overlay-status.json
└── checklists/
    └── requirements.md  # Spec quality validation (already created)
```

### Source Code (repository root)

```text
src/
├── tools/
│   └── video.ts         # EXTEND - Add 3 new overlay control tools
├── context.ts           # MODIFY - Add overlay injection to browser context setup
└── browserContextFactory.ts  # MAY MODIFY - Overlay initialization on context creation

tests/
├── video-overlay.spec.ts     # NEW - Overlay control tests
├── video-overlay-headless.spec.ts  # NEW - Headless mode tests
└── video-state-machine.spec.ts     # NEW - State transition tests
```

**Structure Decision**: Single project structure (existing pattern). All changes localized to video recording subsystem. No new directories needed - extends `src/tools/video.ts` and adds focused test files. Minimal surface area for changes reduces integration risk.

## Complexity Tracking

> No constitutional violations - all gates passed without exceptions. No complexity justification needed.

---

## Phase 0: Research & Technical Decisions

**Goal**: Resolve all technical unknowns and establish implementation patterns

### Research Tasks

1. **Overlay Injection Mechanism**
   - **Question**: How to inject persistent HTML/CSS overlay into Playwright browser pages?
   - **Options**: `page.addInitScript()`, `page.evaluate()` on each navigation, browser extension approach
   - **Decision Needed**: Best method for cross-page overlay persistence

2. **Video Pause/Resume Implementation**
   - **Question**: Can Playwright's `recordVideo` be paused/resumed, or do we need workaround?
   - **Investigation**: Check Playwright API for pause capability, evaluate alternatives (stop/restart with merge)
   - **Decision Needed**: Native pause vs manual video segment merging

3. **Overlay → Backend Communication**
   - **Question**: How do MCP tool calls trigger overlay state changes in the browser?
   - **Options**: `page.evaluate()` to update overlay state, WebSocket channel, polling approach
   - **Decision Needed**: Communication pattern for MCP server → browser overlay

4. **State Management Architecture**
   - **Question**: Where to store recording session state (recording/paused/stopped)?
   - **Options**: Global state in video.ts (current pattern), Context instance property, separate state manager
   - **Decision Needed**: State storage location and access pattern

5. **Headless Mode Behavior**
   - **Question**: How do overlay controls work when browser is headless (no visible UI)?
   - **Investigation**: Verify `page.evaluate()` works in headless, test overlay injection behavior
   - **Decision Needed**: Graceful degradation strategy for headless mode

**Output**: `research.md` documenting all decisions with rationale

---

## Phase 1: Design & Contracts

**Prerequisites**: `research.md` complete with all technical decisions made

### Data Model

**File**: `data-model.md`

**Entities**:

1. **RecordingSession**
   - sessionId: string (UUID)
   - state: "idle" | "recording" | "paused" | "stopped"
   - startTime: Date | null
   - pausedIntervals: Array<{start: Date, end: Date}>
   - videoPath: string | null
   - metadata: {resolution, fps, format}

2. **OverlayState**
   - visible: boolean
   - position: {x: number, y: number}
   - currentAction: "recording" | "paused" | "stopped" | null
   - elapsedTime: number (seconds, excluding paused time)

**State Machine**: RecordingSession transitions
- idle → recording (on start)
- recording → paused (on pause)
- paused → recording (on resume)
- recording → stopped (on stop)
- paused → stopped (on stop)

**Invalid Transitions** (throw errors):
- idle → paused
- idle → stopped
- stopped → recording/paused

### MCP Tool Contracts

**Directory**: `contracts/`

**Tool 1: browser_video_overlay_enable**
```typescript
// File: contracts/overlay-enable.json
{
  "name": "browser_video_overlay_enable",
  "description": "Enable recording overlay controls for current browser session. Shows record/pause/stop buttons that can be triggered via MCP tools.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "position": {
        "type": "string",
        "enum": ["top-left", "top-right", "bottom-left", "bottom-right"],
        "default": "top-right",
        "description": "Overlay position on browser window"
      },
      "autoStart": {
        "type": "boolean",
        "default": false,
        "description": "Automatically start recording when overlay is enabled"
      }
    }
  },
  "capability": "video",
  "classification": "destructive"
}
```

**Tool 2: browser_video_overlay_control**
```typescript
// File: contracts/overlay-control.json
{
  "name": "browser_video_overlay_control",
  "description": "Control recording via overlay buttons (record/pause/resume/stop). Triggers recording state changes and updates overlay visual state.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": ["record", "pause", "resume", "stop"],
        "description": "Recording control action to execute"
      }
    },
    "required": ["action"]
  },
  "capability": "video",
  "classification": "destructive"
}
```

**Tool 3: browser_video_overlay_status**
```typescript
// File: contracts/overlay-status.json
{
  "name": "browser_video_overlay_status",
  "description": "Query current recording state and overlay status. Returns recording duration, state, and video file path if stopped.",
  "inputSchema": {
    "type": "object",
    "properties": {}
  },
  "capability": "video",
  "classification": "readOnly"
}
```

### Integration Points

**Modified Files**:
1. `src/tools/video.ts` - Add 3 new tool definitions
2. `src/context.ts` - Add overlay injection method `injectRecordingOverlay()`
3. `src/config.ts` - Add overlay configuration options (position, auto-enable)

**New Files**:
1. `src/tools/overlay-injection.ts` - HTML/CSS template and injection logic
2. `tests/video-overlay.spec.ts` - Overlay functionality tests
3. `tests/video-overlay-headless.spec.ts` - Headless mode tests

### Testing Strategy

**Test Files to Create**:

1. **tests/video-overlay.spec.ts** (Cross-browser)
   - Test overlay injection on page load
   - Test overlay persists across navigation
   - Test overlay position configuration
   - Test visual button states (recording/paused/stopped indicators)

2. **tests/video-overlay-control.spec.ts** (Integration)
   - Test MCP tool call → overlay state update
   - Test record action starts video capture
   - Test pause action suspends capture (no new frames)
   - Test resume action continues capture
   - Test stop action finalizes video file
   - Test invalid state transitions throw errors

3. **tests/video-overlay-headless.spec.ts** (Headless mode)
   - Test overlay injection in headless mode (should succeed)
   - Test control actions work without visual overlay
   - Test status queries return correct state

4. **tests/video-state-machine.spec.ts** (Unit)
   - Test all valid state transitions
   - Test all invalid transitions throw errors
   - Test pause interval tracking
   - Test elapsed time calculation (excluding paused time)

**Test Commands**:
- `npm run ctest` - Chrome overlay rendering
- `npm run ftest` - Firefox overlay rendering
- `npm run wtest` - WebKit overlay rendering
- `npm run test -- video-overlay-headless` - Headless mode verification

### Quickstart Documentation

**File**: `quickstart.md`

**Sections**:
1. **Overview** - What overlay controls enable (LLM visual feedback)
2. **Basic Usage** - Enable overlay, trigger controls via MCP tools
3. **Configuration** - Overlay position, auto-start options
4. **Headless Mode** - API-only control without visual overlay
5. **Video Output** - Where videos are saved, how to access
6. **Troubleshooting** - Common issues (overlay not visible, recording conflicts)

---

## Phase 2: Implementation Tasks

**Note**: Task generation happens via `/speckit.tasks` command (not part of `/speckit.plan`).

**Expected Task Categories**:
1. **Setup** - Create test files, add overlay HTML/CSS template
2. **US1 (P1)** - Automatic video capture integration with existing tools
3. **US2 (P2)** - Overlay injection, MCP control tools, state machine
4. **US3 (P3)** - Status query tool, overlay status display
5. **Testing** - Cross-browser tests, headless tests, state machine tests
6. **Documentation** - Update README, add overlay usage examples

---

## Dependencies & Risks

### Dependencies
- ✅ Existing video recording tools (`browser_video_start`, `browser_video_stop`, `browser_video_get_status`) - already implemented
- ✅ Playwright `recordVideo` browser context option - proven stable
- ⚠️  Playwright pause/resume capability - **research needed** (Phase 0)
- ✅ Browser `page.evaluate()` API for overlay injection - standard Playwright API

### Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Playwright doesn't support native pause/resume | High - requires video segment merging | Medium | **Phase 0 research** - evaluate FFmpeg merge approach, test segment concatenation |
| Overlay interferes with page interactions | Medium - user complaints | Low | Position overlay in corner, make draggable, add hide option |
| Headless mode breaks overlay injection | Medium - API-only fallback | Low | **Phase 0 testing** - verify `page.evaluate()` works headless |
| Large video files fill disk | Medium - recording failures | Medium | Add file size monitoring, auto-split at 500MB, document disk requirements |
| State machine race conditions | High - recording corruption | Low | Single-threaded state updates, mutex locks if needed |

### Technical Debt Considerations
- **Overlay persistence across navigations**: May need refinement if `addInitScript()` has limitations
- **Video segment merging**: If pause/resume requires FFmpeg, adds external dependency (acceptable per existing `browser_video_convert` tool)
- **Overlay styling**: Initial version uses basic HTML/CSS, may need theming support later

---

## Success Metrics (from Spec)

Tracking against spec success criteria:

- **SC-001**: Video delivery <5s after stop ✅ Testable via integration tests
- **SC-002**: 15+ FPS capture ✅ Testable via frame analysis in tests
- **SC-003**: Pause = no frames ✅ Testable via frame count comparison
- **SC-004**: <500ms control response ✅ Testable via timing assertions
- **SC-005**: 10-minute recording support ✅ Testable via long-running test
- **SC-006**: 95% success rate ✅ Measurable via test pass rate + production metrics
- **SC-007**: Overlay positioning ✅ Testable via screenshot comparison

---

## Next Steps

1. ✅ Complete this plan document
2. **Phase 0**: Execute research tasks → create `research.md`
3. **Phase 1**: Create `data-model.md`, `contracts/`, `quickstart.md`
4. **Phase 1**: Update Claude agent context
5. **Re-validate**: Constitution check after design complete
6. **Generate tasks**: Run `/speckit.tasks` to create implementation task list
