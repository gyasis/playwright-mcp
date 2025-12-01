/**
 * Overlay HTML/CSS template for browser recording controls
 *
 * This template provides visual recording controls that can be injected into
 * browser pages using page.addInitScript(). The overlay persists across
 * page navigations and provides visual feedback of recording state.
 *
 * Design principles from research.md:
 * - Uses page.addInitScript() for persistence across navigations
 * - Minimal footprint (~100x40px)
 * - Positioned in configurable corner to minimize interference
 * - Works in both headed and headless modes (DOM exists in headless)
 */

export type OverlayPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type RecordingState = 'idle' | 'recording' | 'stopped';

/**
 * Generate overlay HTML with CSS and state management
 *
 * @param position - Corner position for overlay placement
 * @param sessionId - Unique session identifier
 * @returns HTML string to be injected via addInitScript
 */
export function generateOverlayHTML(position: OverlayPosition, sessionId: string): string {
  const positionStyles = getPositionStyles(position);

  return `
    (function() {
      // Prevent duplicate overlay injection
      if (document.getElementById('playwright-recording-overlay')) {
        return;
      }

      // Create overlay container
      const overlay = document.createElement('div');
      overlay.id = 'playwright-recording-overlay';
      overlay.dataset.sessionId = '${sessionId}';
      overlay.dataset.state = 'idle';
      overlay.dataset.position = '${position}';

      // Inject styles
      const style = document.createElement('style');
      style.textContent = \`
        #playwright-recording-overlay {
          position: fixed;
          ${positionStyles}
          z-index: 2147483647; /* Maximum z-index */
          background: rgba(0, 0, 0, 0.85);
          border-radius: 8px;
          padding: 8px 12px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 12px;
          color: white;
          display: flex;
          align-items: center;
          gap: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
          user-select: none;
          pointer-events: auto;
        }

        #playwright-recording-overlay.recording {
          background: rgba(220, 38, 38, 0.9);
        }

        #playwright-recording-overlay .record-indicator {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #666;
        }

        #playwright-recording-overlay.recording .record-indicator {
          background: #fff;
          animation: pulse 1.5s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        #playwright-recording-overlay .status-text {
          font-weight: 500;
          min-width: 80px;
        }

        #playwright-recording-overlay .elapsed-time {
          font-variant-numeric: tabular-nums;
          color: rgba(255, 255, 255, 0.9);
        }

        #playwright-recording-overlay .controls {
          display: flex;
          gap: 4px;
          margin-left: 8px;
        }

        #playwright-recording-overlay button {
          background: rgba(255, 255, 255, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.3);
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 500;
          transition: background 0.2s;
        }

        #playwright-recording-overlay button:hover {
          background: rgba(255, 255, 255, 0.3);
        }

        #playwright-recording-overlay button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        #playwright-recording-overlay button.record-btn {
          background: rgba(220, 38, 38, 0.8);
          border-color: rgba(220, 38, 38, 1);
        }

        #playwright-recording-overlay button.record-btn:hover:not(:disabled) {
          background: rgba(220, 38, 38, 1);
        }

        #playwright-recording-overlay button.stop-btn {
          background: rgba(59, 130, 246, 0.8);
          border-color: rgba(59, 130, 246, 1);
        }

        #playwright-recording-overlay button.stop-btn:hover:not(:disabled) {
          background: rgba(59, 130, 246, 1);
        }
      \`;

      // Inject HTML structure
      overlay.innerHTML = \`
        <div class="record-indicator"></div>
        <div class="status-text">
          <span class="status-label">Not Recording</span>
          <span class="elapsed-time" style="display: none;">0:00</span>
        </div>
        <div class="controls">
          <button class="record-btn" title="Start Recording">Record</button>
          <button class="stop-btn" title="Stop Recording" disabled>Stop</button>
        </div>
      \`;

      // Wait for DOM to be ready
      function injectOverlay() {
        if (document.body) {
          document.head.appendChild(style);
          document.body.appendChild(overlay);
        } else {
          // DOM not ready yet, wait for DOMContentLoaded
          document.addEventListener('DOMContentLoaded', () => {
            document.head.appendChild(style);
            document.body.appendChild(overlay);
          });
        }
      }

      // Inject immediately or wait for DOM
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectOverlay);
      } else {
        injectOverlay();
      }
    })();
  `;
}

/**
 * Get CSS positioning styles based on overlay position
 */
function getPositionStyles(position: OverlayPosition): string {
  switch (position) {
    case 'top-left':
      return 'top: 16px; left: 16px;';
    case 'top-right':
      return 'top: 16px; right: 16px;';
    case 'bottom-left':
      return 'bottom: 16px; left: 16px;';
    case 'bottom-right':
      return 'bottom: 16px; right: 16px;';
  }
}

/**
 * Script to update overlay visual state
 * This is injected via page.evaluate() when recording state changes
 *
 * @param state - New recording state
 * @param elapsedTime - Elapsed recording time in seconds (optional)
 */
export function generateUpdateStateScript(state: RecordingState, elapsedTime?: number): string {
  return `
    (function() {
      const overlay = document.getElementById('playwright-recording-overlay');
      if (!overlay) return;

      const statusLabel = overlay.querySelector('.status-label');
      const elapsedTimeEl = overlay.querySelector('.elapsed-time');
      const recordBtn = overlay.querySelector('.record-btn');
      const stopBtn = overlay.querySelector('.stop-btn');

      overlay.dataset.state = '${state}';

      if ('${state}' === 'idle') {
        overlay.classList.remove('recording');
        if (statusLabel) statusLabel.textContent = 'Not Recording';
        if (elapsedTimeEl) elapsedTimeEl.style.display = 'none';
        if (recordBtn) recordBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
      } else if ('${state}' === 'recording') {
        overlay.classList.add('recording');
        if (statusLabel) statusLabel.textContent = 'Recording';
        if (elapsedTimeEl) {
          elapsedTimeEl.style.display = 'inline';
          const elapsed = ${elapsedTime ?? 0};
          const minutes = Math.floor(elapsed / 60);
          const seconds = Math.floor(elapsed % 60);
          elapsedTimeEl.textContent = minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
        }
        if (recordBtn) recordBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = false;
      } else if ('${state}' === 'stopped') {
        overlay.classList.remove('recording');
        if (statusLabel) statusLabel.textContent = 'Recording Stopped';
        if (elapsedTimeEl) {
          const elapsed = ${elapsedTime ?? 0};
          const minutes = Math.floor(elapsed / 60);
          const seconds = Math.floor(elapsed % 60);
          elapsedTimeEl.textContent = minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
        }
        if (recordBtn) recordBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
      }
    })();
  `;
}
