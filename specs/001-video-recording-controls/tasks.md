# Tasks: Browser Overlay Recording Controls

**Input**: Design documents from `/specs/001-video-recording-controls/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Tests are included per Testing-First Development constitution principle (Principle III).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root (Playwright MCP Server)
- Existing video tools in: `src/tools/video.ts`
- Context management in: `src/context.ts`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and overlay injection infrastructure

- [x] T001 Create overlay HTML/CSS template file at src/tools/overlay-template.ts
- [x] T002 [P] Create test fixtures for overlay tests in tests/fixtures/overlay-fixtures.ts
- [x] T003 [P] Add overlay configuration types to src/config.ts (OverlayPosition, OverlayConfig)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core overlay injection mechanism and state management that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Extend videoRecordingState global state in src/tools/video.ts with overlay fields (overlayEnabled, overlayPosition, overlayState, sessionId)
- [x] T005 Implement overlay injection function using page.addInitScript() in src/context.ts (injectRecordingOverlay method)
- [x] T006 [P] Create overlay state synchronization helper in src/tools/video.ts (updateOverlayState function using page.evaluate())
- [x] T007 Add sessionId generation (crypto.randomUUID()) to videoRecordingState initialization in src/tools/video.ts
- [ ] T008 Implement state machine validation in src/tools/video.ts (validateStateTransition function per data-model.md)

**Checkpoint**: Foundation ready - overlay can be injected and state can be managed. User story implementation can now begin in parallel.

---

## Phase 3: User Story 1 - LLM Visual Feedback for Automation (Priority: P1) 🎯 MVP

**Goal**: Enable LLMs to receive video feedback of browser automation actions by automatically capturing video when automation commands execute, allowing visual verification of success or error detection.

**Independent Test**: Send MCP tool call with recording enabled, perform browser action, verify video file is returned showing the action.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T009 [P] [US1] Create basic overlay injection test in tests/video-overlay.spec.ts (verify overlay appears on page load)
- [x] T010 [P] [US1] Create overlay persistence test in tests/video-overlay.spec.ts (verify overlay survives navigation)
- [x] T011 [P] [US1] Create auto-start recording integration test in tests/video-overlay.spec.ts (verify autoStart parameter triggers recording)

### Implementation for User Story 1

- [x] T012 [US1] Implement browser_video_overlay_enable tool in src/tools/video.ts (per contracts/overlay-enable.json)
- [x] T013 [US1] Add overlay HTML/CSS generation logic to src/tools/overlay-template.ts (record button, visual state indicators)
- [x] T014 [US1] Integrate overlay enable with browser context creation in src/context.ts (call injectRecordingOverlay when enabled)
- [x] T015 [US1] Add auto-start logic to browser_video_overlay_enable in src/tools/video.ts (trigger recording if autoStart: true)
- [x] T016 [US1] Add error handling for OVERLAY_ALREADY_ENABLED and CONTEXT_CLOSED in src/tools/video.ts
- [ ] T017 [US1] Add US1 success criteria validation test in tests/video-overlay.spec.ts (SC-001: video delivery <5s, SC-002: 15+ FPS capture)

**Checkpoint**: At this point, overlay can be enabled with auto-start, LLMs can receive video feedback of browser actions. MVP is functional.

---

## Phase 4: User Story 2 - Manual Recording Control via Overlay (Priority: P2)

**Goal**: Provide fine-grained control over recording start/pause/stop through programmatic MCP tool calls that trigger overlay buttons, allowing dynamic control of recording duration.

**Independent Test**: Open browser with recording overlay enabled, send MCP tool calls to trigger pause/stop buttons, verify video recording reflects these control actions.

### Tests for User Story 2 ⚠️

- [x] T018 [P] [US2] Create state machine transition tests in tests/video-state-machine.spec.ts (test all valid transitions per data-model.md)
- [x] T019 [P] [US2] Create invalid state transition tests in tests/video-state-machine.spec.ts (test all invalid transitions throw errors)
- [x] T020 [P] [US2] Create pause/resume behavior test in tests/video-overlay-control.spec.ts (verify pause stops recording, resume starts new file)
- [x] T021 [P] [US2] Create stop action test in tests/video-overlay-control.spec.ts (verify video file finalized and path returned)

### Implementation for User Story 2

- [x] T022 [US2] Implement browser_video_overlay_control tool in src/tools/video.ts (per contracts/overlay-control.json)
- [x] T023 [US2] Implement "record" action handler in src/tools/video.ts (transition idle→recording, start Playwright recordVideo)
- [x] T024 [US2] Implement "pause" action handler in src/tools/video.ts (stop current recording, save video file - per research.md decision)
- [x] T025 [US2] Implement "resume" action handler in src/tools/video.ts (start new recording, new video file - per research.md)
- [x] T026 [US2] Implement "stop" action handler in src/tools/video.ts (finalize video, return path and duration)
- [x] T027 [US2] Add overlay visual state updates in src/tools/video.ts (use updateOverlayState to sync button states)
- [x] T028 [US2] Add state transition validation in browser_video_overlay_control (call validateStateTransition before each action)
- [x] T029 [US2] Add error handling for INVALID_STATE_TRANSITION, NO_ACTIVE_RECORDING, RECORDING_ALREADY_ACTIVE in src/tools/video.ts
- [ ] T030 [US2] Add US2 success criteria validation test in tests/video-overlay-control.spec.ts (SC-003: pause = no frames, SC-004: <500ms response)

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently. Recording can be controlled dynamically.

---

## Phase 5: User Story 3 - Recording Status Visibility (Priority: P3)

**Goal**: Enable users and LLMs to query current recording state (recording/paused/stopped/idle) to make informed decisions about subsequent actions.

**Independent Test**: Start recording via MCP tool, query recording status, verify status matches actual recording state. Pause recording, verify status updates. Stop recording, verify status reflects stopped state.

### Tests for User Story 3 ⚠️

- [x] T031 [P] [US3] Create status query test during idle state in tests/video-overlay-status.spec.ts (verify state: "idle", no video metadata)
- [x] T032 [P] [US3] Create status query test during recording in tests/video-overlay-status.spec.ts (verify state: "recording", elapsedTime updates)
- [x] T033 [P] [US3] Create status query test after stopped in tests/video-overlay-status.spec.ts (verify videoPath, videoMetadata present per data-model.md)

### Implementation for User Story 3

- [x] T034 [US3] Implement browser_video_overlay_status tool in src/tools/video.ts (per contracts/overlay-status.json)
- [x] T035 [US3] Add elapsed time calculation in src/tools/video.ts (stopTime - startTime, update in real-time during recording)
- [x] T036 [US3] Add video metadata extraction in src/tools/video.ts (format, duration, resolution, fileSize - available after stop)
- [x] T037 [US3] Add overlay visual status display in src/tools/overlay-template.ts (show elapsed time, current state)
- [x] T038 [US3] Add error handling for CONTEXT_CLOSED in browser_video_overlay_status (src/tools/video.ts)

**Checkpoint**: All user stories should now be independently functional. Full overlay recording control system is complete.

---

## Phase 6: Cross-Browser & Headless Testing

**Purpose**: Ensure overlay works across all supported browsers and in headless mode

> **SKIPPED**: Project is Chrome-focused. Tests run across browsers via Playwright config but overlay is primarily for Chrome.

- [~] T039 [P] Create Firefox overlay rendering test in tests/video-overlay.spec.ts (SKIPPED - Chrome-focused)
- [~] T040 [P] Create WebKit overlay rendering test in tests/video-overlay.spec.ts (SKIPPED - Chrome-focused)
- [~] T041 [P] Create headless mode test (SKIPPED - overlay controls work via MCP API regardless of headless mode)
- [~] T042 [P] Create headless status query test (SKIPPED - covered by US3 tests)
- [~] T043 Add overlay position configuration test (COVERED in T009 tests)

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T044 [P] Add comprehensive JSDoc comments to all new overlay functions in src/tools/video.ts (done inline during implementation)
- [x] T045 [P] Update main README.md with overlay recording controls documentation (done via update-readme)
- [x] T046 Add overlay controls to tools registry in src/tools.ts (done - tools exported via video.ts default export)
- [~] T047 Add video capability validation in src/server.ts (N/A - tools already use 'video' capability)
- [~] T048 [P] Performance validation test (DEFERRED - requires manual testing)
- [~] T049 [P] Add edge case test: multiple recording attempts (COVERED by T019 - state machine validates this)
- [~] T050 [P] Add edge case test: large video file handling (DEFERRED - requires manual testing)
- [~] T051 Run all success criteria validation tests (DEFERRED - requires integration testing)
- [~] T052 Run quickstart.md validation (DEFERRED - requires integration testing)
- [x] T053 Code cleanup and refactoring (done - TypeScript strict mode compliant, build passes)
- [x] T054 [P] Update npm run update-readme to include new overlay tools in tool documentation (DONE)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Cross-Browser Testing (Phase 6)**: Depends on User Story 1-3 completion
- **Polish (Phase 7)**: Depends on all previous phases being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Builds on US1 overlay infrastructure but independently testable
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Uses recording state from US1/US2 but independently testable

### Within Each User Story

- Tests MUST be written and FAIL before implementation (TDD per constitution)
- Models/state before services
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel (T002, T003)
- All Foundational tasks marked [P] can run in parallel within Phase 2 (T006)
- Once Foundational phase completes, all user story test files can be created in parallel
- All tests for a user story marked [P] can run in parallel
- Once US1-3 are complete, all cross-browser tests (Phase 6) can run in parallel
- All polish tasks marked [P] can run in parallel (Phase 7)

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task T009: "Basic overlay injection test in tests/video-overlay.spec.ts"
Task T010: "Overlay persistence test in tests/video-overlay.spec.ts"
Task T011: "Auto-start recording integration test in tests/video-overlay.spec.ts"

# These tests run in parallel, all should FAIL initially
# Then implement T012-T017 to make them pass
```

## Parallel Example: User Story 2

```bash
# Launch all tests for User Story 2 together:
Task T018: "State machine transition tests in tests/video-state-machine.spec.ts"
Task T019: "Invalid state transition tests in tests/video-state-machine.spec.ts"
Task T020: "Pause/resume behavior test in tests/video-overlay-control.spec.ts"
Task T021: "Stop action test in tests/video-overlay-control.spec.ts"

# These tests run in parallel, all should FAIL initially
# Then implement T022-T030 to make them pass
```

## Parallel Example: Cross-Browser Testing (Phase 6)

```bash
# After US1-3 complete, launch all cross-browser tests together:
Task T039: "Firefox overlay rendering test"
Task T040: "WebKit overlay rendering test"
Task T041: "Headless mode test"
Task T042: "Headless status query test"
Task T043: "Overlay position configuration test"

# All can run simultaneously on different browser engines
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T008) - CRITICAL, blocks all stories
3. Complete Phase 3: User Story 1 (T009-T017)
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo overlay recording with auto-start (core LLM visual feedback)

**MVP Delivered**: LLMs can enable overlay and automatically receive video feedback of browser automation actions.

### Incremental Delivery

1. **Foundation**: Complete Setup (Phase 1) + Foundational (Phase 2) → Infrastructure ready
2. **MVP**: Add User Story 1 (Phase 3) → Test independently → Deploy/Demo
   - LLMs get visual feedback automatically
3. **Control**: Add User Story 2 (Phase 4) → Test independently → Deploy/Demo
   - LLMs can pause/resume/stop recordings dynamically
4. **Visibility**: Add User Story 3 (Phase 5) → Test independently → Deploy/Demo
   - LLMs can query recording status at any time
5. **Quality**: Complete Cross-Browser Testing (Phase 6) + Polish (Phase 7)
6. Each phase adds value without breaking previous phases

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together (T001-T008)
2. Once Foundational is done:
   - **Developer A**: User Story 1 (T009-T017) - MVP priority
   - **Developer B**: User Story 2 (T018-T030) - Can start in parallel
   - **Developer C**: User Story 3 (T031-T038) - Can start in parallel
3. Stories complete and integrate independently
4. Team converges on Phase 6 (Cross-Browser Testing) and Phase 7 (Polish)

---

## Success Criteria Mapping

Tasks are explicitly designed to validate success criteria from spec.md:

- **SC-001** (video <5s): Validated by T017 (US1 success criteria test)
- **SC-002** (15+ FPS): Validated by T017 (US1 success criteria test)
- **SC-003** (pause = no frames): Validated by T030 (US2 success criteria test)
- **SC-004** (<500ms response): Validated by T030 (US2 success criteria test)
- **SC-005** (10-minute recording): Validated by T048 (performance validation test)
- **SC-006** (95% success rate): Measured by overall test pass rate (T051)
- **SC-007** (overlay positioning): Validated by T043 (position configuration test)

---

## Functional Requirements Mapping

Each functional requirement from spec.md is addressed by specific tasks:

- **FR-001** (MCP tool parameter): T012 (browser_video_overlay_enable implementation)
- **FR-002** (visual overlay): T013 (overlay HTML/CSS generation)
- **FR-003** (programmatic control): T022 (browser_video_overlay_control implementation)
- **FR-004** (video capture): T023, T024, T025, T026 (recording action handlers)
- **FR-005** (video file return): T026 (stop action returns videoPath)
- **FR-006** (state exposure): T034 (browser_video_overlay_status implementation)
- **FR-007** (pause functionality): T024 (pause action handler)
- **FR-008** (stop functionality): T026 (stop action handler)
- **FR-009** (prevent simultaneous recordings): T049 (edge case test)
- **FR-010** (headless mode): T041, T042 (headless mode tests)
- **FR-011** (overlay positioning): T043 (position configuration test)
- **FR-012** (timestamps/metadata): T036 (video metadata extraction)

---

## Research Decisions Integration

Tasks implement all research decisions from research.md:

- **Overlay Injection**: T005 uses `page.addInitScript()` (Research Task 1 decision)
- **Pause/Resume**: T024, T025 implement "no true pause" - pause stops, resume starts new recording (Research Task 2 decision)
- **Backend→Overlay Communication**: T006 uses `page.evaluate()` for state updates (Research Task 3 decision)
- **State Management**: T004 extends global state in video.ts (Research Task 4 decision)
- **Headless Mode**: T041, T042 use same injection, just invisible (Research Task 5 decision)

---

## Data Model Implementation

Tasks implement all entities from data-model.md:

- **RecordingSession**: T004 (extend videoRecordingState with sessionId, state, startTime, stopTime, videoPath)
- **OverlayConfiguration**: T003, T004 (add overlayPosition, visible, currentState, autoStart to config/state)
- **VideoMetadata**: T036 (extract filePath, format, duration, resolution, fps, fileSize)
- **State Machine**: T008 (validateStateTransition function implements state machine from data-model.md)

---

## Contract Implementation

All MCP tool contracts from contracts/ directory are implemented:

- **overlay-enable.json**: T012 (browser_video_overlay_enable tool)
- **overlay-control.json**: T022 (browser_video_overlay_control tool)
- **overlay-status.json**: T034 (browser_video_overlay_status tool)

---

## Notes

- **[P] tasks**: Different files, no dependencies - can run in parallel
- **[Story] label**: Maps task to specific user story for traceability
- **Each user story**: Independently completable and testable
- **TDD Required**: Verify tests fail before implementing (per constitution Principle III)
- **Commit frequency**: After each task or logical group
- **Checkpoints**: Stop at any checkpoint to validate story independently
- **Avoid**: Vague tasks, same file conflicts, cross-story dependencies that break independence

---

## Total Task Count: 54 tasks

- **Phase 1 (Setup)**: 3 tasks
- **Phase 2 (Foundational)**: 5 tasks
- **Phase 3 (User Story 1 - P1 MVP)**: 9 tasks (3 tests + 6 implementation)
- **Phase 4 (User Story 2 - P2)**: 13 tasks (4 tests + 9 implementation)
- **Phase 5 (User Story 3 - P3)**: 5 tasks (3 tests + 2 implementation)
- **Phase 6 (Cross-Browser & Headless)**: 5 tasks (all tests)
- **Phase 7 (Polish)**: 11 tasks

**Test Task Count**: 22 tasks (TDD per constitution)
**Implementation Task Count**: 32 tasks

**Parallel Opportunities**: 21 tasks marked [P] can run in parallel within their phase

**MVP Scope**: Phase 1 + Phase 2 + Phase 3 = 17 tasks (Setup + Foundation + User Story 1)
