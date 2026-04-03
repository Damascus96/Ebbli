/**
 * Ebbli for ChatGPT - Status Bar
 * Compact floating pill indicator showing trimming statistics
 * Hiraeth House design system V3
 */

import { TIMING } from '../shared/constants';

const STATUS_BAR_ID = 'Ebbli-status-bar';
const WAITING_TEXT = 'Ebbli · waiting for messages…';

export interface StatusBarStats {
  totalMessages: number;
  visibleMessages: number;
  trimmedMessages: number;
  keepLastN: number;
}

type StatusBarState = 'active' | 'waiting' | 'all-visible' | 'unrecognized';

let currentStats: StatusBarStats | null = null;
let isVisible = true;

// Throttle status bar updates to reduce DOM writes during active chat
let lastUpdateTime = 0;
let pendingStats: StatusBarStats | null = null;
let pendingUpdateTimer: number | null = null;

/**
 * Get or create the status bar element
 */
function getOrCreateStatusBar(): HTMLElement | null {
  let bar = document.getElementById(STATUS_BAR_ID);
  if (bar) {
    return bar;
  }

  bar = document.createElement('div');
  bar.id = STATUS_BAR_ID;
  bar.setAttribute('role', 'status');
  bar.setAttribute('aria-live', 'polite');

  applyStatusBarStyles(bar);

  document.body.appendChild(bar);

  return bar;
}

/**
 * Apply inline styles to the status bar (compact pill, bottom-right)
 * All colour values from Hiraeth House design system V3
 */
function applyStatusBarStyles(bar: HTMLElement): void {
  Object.assign(bar.style, {
    position: 'fixed',
    bottom: '3.5px',
    right: '24px',
    zIndex: '2147483647',
    padding: '4px 12px',
    fontSize: '10px',
    fontFamily: '"Cabinet Grotesk", "Segoe UI", sans-serif',
    fontWeight: '600',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: '#9aaa90',                             // --text-2 muted sage
    backgroundColor: 'rgba(9, 13, 8, 0.92)',     // --bg #090d08
    border: '1px solid rgba(255, 255, 255, 0.07)',
    borderRadius: '9999px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.6)',
    backdropFilter: 'blur(8px)',
    maxWidth: '60%',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    pointerEvents: 'none',
    transition: 'opacity 0.2s ease',
  });
}

/**
 * Get status bar text based on current state
 */
function getStatusText(stats: StatusBarStats): { text: string; state: StatusBarState } {
  if (stats.trimmedMessages > 0) {
    return {
      text: `Ebbli · last ${stats.keepLastN} · ${stats.trimmedMessages} trimmed`,
      state: 'active',
    };
  }

  if (stats.totalMessages === 0) {
    return {
      text: 'Ebbli · waiting for messages…',
      state: 'waiting',
    };
  }

  if (stats.totalMessages <= stats.keepLastN) {
    return {
      text: `Ebbli · all ${stats.totalMessages} visible`,
      state: 'all-visible',
    };
  }

  return {
    text: `Ebbli · ${stats.visibleMessages} visible`,
    state: 'active',
  };
}

/**
 * Apply state-specific styling
 * Colour values: Hiraeth House design system V3
 */
function applyStateStyles(bar: HTMLElement, state: StatusBarState): void {
  // Reset to V3 defaults
  bar.style.opacity = '1';
  bar.style.color = '#9aaa90';                              // --text-2 muted sage
  bar.style.backgroundColor = 'rgba(9, 13, 8, 0.92)';     // --bg #090d08
  bar.style.borderColor = 'rgba(255, 255, 255, 0.07)';    // --border

  switch (state) {
    case 'active':
      bar.style.color = '#00C2A0';                          // --teal
      bar.style.backgroundColor = 'rgba(9, 13, 8, 0.92)';
      bar.style.borderColor = 'rgba(0, 194, 160, 0.22)';   // --teal-border
      break;
    case 'waiting':
      bar.style.color = '#5a7a50';                          // --text-3 dark sage
      break;
    case 'all-visible':
      // Neutral default styling — no override needed
      break;
    case 'unrecognized':
      bar.style.color = '#F0AD4E';                          // --amber
      bar.style.backgroundColor = 'rgba(9, 13, 8, 0.92)';
      bar.style.borderColor = 'rgba(240, 173, 78, 0.25)';  // --warning-border
      break;
  }
}

/**
 * Check if two stats objects are equal (for change detection)
 */
function statsEqual(a: StatusBarStats | null, b: StatusBarStats | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.totalMessages === b.totalMessages &&
    a.visibleMessages === b.visibleMessages &&
    a.trimmedMessages === b.trimmedMessages &&
    a.keepLastN === b.keepLastN
  );
}

/**
 * Actually render the status bar (internal, bypasses throttle)
 */
function renderStatusBar(displayStats: StatusBarStats): void {
  const bar = getOrCreateStatusBar();
  if (!bar) {
    return;
  }

  const { text, state } = getStatusText(displayStats);
  bar.textContent = text;
  applyStateStyles(bar, state);
  lastUpdateTime = performance.now();
}

function renderWaitingStatusBar(bar: HTMLElement): void {
  bar.textContent = WAITING_TEXT;
  applyStateStyles(bar, 'waiting');
  lastUpdateTime = performance.now();
}

/**
 * Update the status bar with new stats (throttled, with change detection)
 */
export function updateStatusBar(stats: StatusBarStats): void {
  const displayStats: StatusBarStats = stats;

  if (statsEqual(displayStats, currentStats)) {
    return;
  }

  currentStats = displayStats;

  if (!isVisible) {
    return;
  }

  const now = performance.now();
  const elapsed = now - lastUpdateTime;

  if (elapsed >= TIMING.STATUS_BAR_THROTTLE_MS) {
    if (pendingUpdateTimer !== null) {
      clearTimeout(pendingUpdateTimer);
      pendingUpdateTimer = null;
    }
    pendingStats = null;
    renderStatusBar(displayStats);
  } else {
    pendingStats = displayStats;
    if (pendingUpdateTimer === null) {
      const delay = TIMING.STATUS_BAR_THROTTLE_MS - elapsed;
      pendingUpdateTimer = window.setTimeout(() => {
        pendingUpdateTimer = null;
        if (pendingStats && isVisible) {
          renderStatusBar(pendingStats);
          pendingStats = null;
        }
      }, delay);
    }
  }
}

/**
 * Show warning when ChatGPT layout is not recognized
 */
export function showLayoutNotRecognized(): void {
  if (!isVisible) {
    return;
  }

  const bar = getOrCreateStatusBar();
  if (!bar) {
    return;
  }

  bar.textContent = 'Ebbli · layout not recognized';
  applyStateStyles(bar, 'unrecognized');
}

/**
 * Show the status bar
 */
export function showStatusBar(): void {
  isVisible = true;
  const bar = getOrCreateStatusBar();
  if (!bar) {
    return;
  }

  bar.style.display = 'block';

  if (currentStats) {
    const { text, state } = getStatusText(currentStats);
    bar.textContent = text;
    applyStateStyles(bar, state);
    lastUpdateTime = performance.now();
    return;
  }

  renderWaitingStatusBar(bar);
}

/**
 * Hide the status bar
 */
export function hideStatusBar(): void {
  isVisible = false;
  const bar = document.getElementById(STATUS_BAR_ID);

  if (bar) {
    bar.style.display = 'none';
  }
}

/**
 * Remove the status bar from DOM
 */
export function removeStatusBar(): void {
  if (pendingUpdateTimer !== null) {
    clearTimeout(pendingUpdateTimer);
    pendingUpdateTimer = null;
  }
  pendingStats = null;

  const bar = document.getElementById(STATUS_BAR_ID);
  if (bar) {
    bar.remove();
  }
  currentStats = null;
  isVisible = false;
  lastUpdateTime = 0;
}

/**
 * Reset status bar state (call on chat navigation / empty chat)
 */
export function resetAccumulatedTrimmed(): void {
  currentStats = null;
  pendingStats = null;
  if (pendingUpdateTimer !== null) {
    clearTimeout(pendingUpdateTimer);
    pendingUpdateTimer = null;
  }

  if (!isVisible) {
    return;
  }

  const bar = getOrCreateStatusBar();
  if (!bar) {
    return;
  }

  renderWaitingStatusBar(bar);
}

/**
 * Refresh status bar after SPA navigation or DOM resets
 */
export function refreshStatusBar(): void {
  if (!isVisible) {
    return;
  }

  const bar = getOrCreateStatusBar();
  if (!bar) {
    return;
  }

  bar.style.display = 'block';

  if (currentStats) {
    const { text, state } = getStatusText(currentStats);
    bar.textContent = text;
    applyStateStyles(bar, state);
    lastUpdateTime = performance.now();
    return;
  }

  renderWaitingStatusBar(bar);
}

/**
 * Set status bar visibility based on settings
 */
export function setStatusBarVisibility(visible: boolean): void {
  if (visible) {
    showStatusBar();
  } else {
    hideStatusBar();
  }
}
