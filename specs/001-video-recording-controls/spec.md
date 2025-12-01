# Feature Specification: Browser Overlay Recording Controls

**Feature Branch**: `001-video-recording-controls`
**Created**: 2025-11-29
**Status**: Draft
**Input**: User description: "Add browser overlay recording controls with record, pause, and stop buttons that integrate with MCP tool calls to provide LLMs with visual feedback of browser automation actions and errors"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - LLM Visual Feedback for Automation (Priority: P1)

An LLM needs to verify that browser automation commands executed correctly and detect any errors that occurred during execution. When the LLM sends MCP tool calls to navigate or interact with the browser, it receives back a video recording showing exactly what happened, enabling it to see visual errors, unexpected states, or confirmation of successful actions.

**Why this priority**: This is the core value proposition - giving LLMs visual feedback to understand what actually happened during browser automation, which is currently limited to text-based responses.

**Independent Test**: Can be fully tested by sending an MCP tool call with recording enabled, performing a browser action, and verifying that a video file is returned showing the action. Delivers immediate value by allowing LLMs to "see" what happened.

**Acceptance Scenarios**:

1. **Given** an LLM sends `browser_navigate` with a record parameter enabled, **When** the navigation completes (successfully or with errors), **Then** the LLM receives a video file showing the browser navigation process including any error messages or unexpected behavior
2. **Given** an LLM executes multiple browser actions with recording enabled, **When** all actions complete, **Then** the LLM receives a single continuous video showing the entire automation sequence
3. **Given** a browser automation encounters an error (e.g., element not found, timeout), **When** the error occurs during recording, **Then** the video captures the error state visually so the LLM can understand what went wrong

---

### User Story 2 - Manual Recording Control via Overlay (Priority: P2)

A user or LLM wants fine-grained control over when recording starts and stops without needing to specify this in advance. When a browser window opens with recording capability, visible overlay controls (record, pause, stop buttons) appear on the browser that can be triggered programmatically via MCP tools, allowing dynamic control of recording duration.

**Why this priority**: This provides flexibility and control, but the basic functionality of "record the whole session" (P1) delivers value without needing pause/stop controls.

**Independent Test**: Open browser with recording overlay enabled, send MCP tool calls to trigger pause/stop buttons, and verify the video recording reflects these control actions (paused sections not recorded, stopped recording ends file).

**Acceptance Scenarios**:

1. **Given** a browser window is open with recording overlay visible, **When** an MCP tool call triggers the "Pause" button, **Then** the video recording pauses (no frames captured) until resumed
2. **Given** recording is in progress, **When** an MCP tool call triggers the "Stop" button, **Then** the recording ends and the video file is finalized and made available
3. **Given** recording is paused, **When** an MCP tool call triggers the "Record" button again, **Then** recording resumes and continues appending to the same video file

---

### User Story 3 - Recording Status Visibility (Priority: P3)

Users and LLMs need to know the current recording state (recording, paused, stopped, not recording) to make informed decisions about subsequent actions. The overlay displays visual indicators showing current recording status, and MCP tools can query the status programmatically.

**Why this priority**: Status visibility is helpful but not critical - the recording will work without explicit status checks. This is a polish feature that improves user experience.

**Independent Test**: Start recording via MCP tool, query recording status, verify status matches actual recording state. Pause recording, verify status updates. Stop recording, verify status reflects stopped state.

**Acceptance Scenarios**:

1. **Given** recording is active, **When** status is queried via MCP tool or viewed on overlay, **Then** status shows "Recording" with elapsed time
2. **Given** recording is paused, **When** status is queried, **Then** status shows "Paused" with total recorded duration (excluding paused time)
3. **Given** no recording is active, **When** status is queried, **Then** status shows "Not Recording"

---

### Edge Cases

- What happens when recording is started multiple times without stopping first? (Should reject or auto-stop previous recording)
- How does the system handle very long recordings that may exceed file size limits? (Should provide warnings or auto-split into multiple files)
- What happens if the browser crashes or closes unexpectedly during recording? (Should attempt to save partial recording)
- How does the overlay interact with existing browser UI elements that may overlap? (Overlay should be draggable or auto-position to avoid critical UI)
- What happens when network connectivity is lost during recording? (Recording should continue locally, network status should not affect recording)
- How are recordings handled in headless mode where overlays are not visible? (Overlay controls should still work via MCP tool calls even if not visually rendered)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide an MCP tool parameter (e.g., `enable_recording_overlay: true`) that enables recording controls for browser sessions
- **FR-002**: System MUST display a visual overlay on the browser window when recording controls are enabled, showing record, pause, and stop buttons
- **FR-003**: System MUST allow MCP tool calls to programmatically trigger recording control buttons (record, pause, stop) without requiring visual interaction
- **FR-004**: System MUST capture video of all browser activity when recording is active, including navigation, user interactions, errors, and visual state changes
- **FR-005**: System MUST return video files to the MCP client after recording stops, in a format compatible with common video players (MP4 or WebM)
- **FR-006**: System MUST maintain recording state (recording/paused/stopped) and expose this state via MCP tool calls for status queries
- **FR-007**: System MUST handle pause functionality by suspending video capture without finalizing the file, allowing resumption
- **FR-008**: System MUST handle stop functionality by finalizing the video file and making it available for download/access
- **FR-009**: System MUST prevent multiple simultaneous recordings on the same browser context (reject new recording start if one is already active)
- **FR-010**: System MUST work in both headed and headless browser modes (overlay may not be visible in headless, but controls must still function via API)
- **FR-011**: Overlay controls MUST be positioned to minimize interference with browser content and standard browser UI elements
- **FR-012**: System MUST include timestamps or metadata indicating when recording started, paused, resumed, and stopped

### Key Entities

- **Recording Session**: Represents an active or completed recording, with attributes including start time, duration, pause intervals, file path, and current state (recording/paused/stopped)
- **Recording Control Command**: Represents MCP tool call parameters for controlling recording (action: start/pause/resume/stop, session ID)
- **Video File**: The output artifact containing recorded browser activity, with metadata including duration, resolution, format, and associated session ID

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: LLMs can successfully initiate recording via MCP tool call and receive video file showing browser actions within 5 seconds of stopping recording
- **SC-002**: Video recordings accurately capture all visible browser activity including page loads, interactions, and error states with at least 15 FPS (smooth enough to understand actions)
- **SC-003**: Pause and resume functionality works correctly with no recorded frames during paused intervals (verified by frame analysis)
- **SC-004**: Recording overlay controls respond to MCP tool calls within 500ms (near-instantaneous control)
- **SC-005**: System supports recording sessions up to 10 minutes in duration without performance degradation or file corruption
- **SC-006**: 95% of recording sessions complete successfully and produce valid, playable video files
- **SC-007**: Overlay positioning does not obscure critical browser UI elements (address bar, navigation controls) in default browser window sizes (1280x720 and above)

## Assumptions *(mandatory)*

- Video recording capability already exists in the Playwright MCP server (based on recent commit `98534b4` adding video recording tools)
- Browser automation is performed via Playwright, which supports video recording at the browser context level
- MCP clients can receive and handle binary video file responses
- Users have sufficient disk space for video file storage (recordings may be several MB per minute)
- Default video format (WebM or MP4) is acceptable - no custom codec requirements specified
- Recording controls can be implemented as browser overlays using HTML/CSS injected into the page context
- Overlay should use minimal resources and not significantly impact browser performance during recording

## Dependencies *(optional)*

- Existing `browser_video_start`, `browser_video_stop`, and `browser_video_get_status` MCP tools (already implemented per commit `98534b4`)
- Playwright's `recordVideo` browser context option
- File system access for saving video files to output directory
- Browser support for overlay rendering (injected HTML/CSS/JavaScript)

## Out of Scope *(optional)*

- Real-time video streaming (video is only available after recording stops)
- Video editing or post-processing (trimming, annotations, highlights) beyond basic recording
- Audio capture (recording is video-only unless specifically added)
- Cloud storage upload (videos are saved locally only)
- Advanced video analytics or AI-based error detection in video content
- Custom video quality/resolution configuration in this phase (uses existing video tool defaults)
- Multi-tab or multi-window recording (recording is per browser context/window)
