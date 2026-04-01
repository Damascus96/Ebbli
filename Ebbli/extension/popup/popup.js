"use strict";
(() => {
  // extension/src/shared/browser-polyfill.ts
  var api = typeof browser !== "undefined" ? browser : chrome;
  var browser_polyfill_default = api;

  // extension/src/shared/constants.ts
  var TIMING = {
    /**
     * Duration of BOOT mode after page load/navigation (ms).
     *
     * Rationale:
     * - BOOT mode uses queueMicrotask for instant trimming before paint
     * - 1500ms covers typical ChatGPT page load + initial render
     * - After this, switch to STEADY mode with debouncing for efficiency
     * - Too short: may miss initial large DOM loads
     * - Too long: wastes CPU on frequent microtask scheduling
     */
    BOOT_DURATION_MS: 1500,
    /**
     * Debounce delay for MutationObserver callback invocations (ms).
     *
     * Rationale:
     * - 75ms provides good balance between responsiveness and efficiency
     * - At 60fps, one frame = ~16.67ms, so 75ms = ~4.5 frames
     * - Typical user typing/scrolling generates 10-50 mutations per second
     * - 75ms batches these into ~13 evaluations/second max
     * - Short enough to feel responsive, long enough to batch rapid changes
     */
    DEBOUNCE_MS: 75,
    /**
     * Main thread budget per requestIdleCallback batch (ms).
     *
     * Rationale:
     * - 16ms = one frame at 60fps, the target for smooth animations
     * - We use requestIdleCallback which yields to more urgent work
     * - Actual execution may be shorter if browser needs the time
     * - Ensures trimming doesn't cause visible jank or dropped frames
     */
    BATCH_BUDGET_MS: 16,
    /**
     * Number of DOM nodes to remove per batch iteration.
     *
     * Rationale:
     * - Empirically tuned: ~2ms average per node removal (DOM mutation + repaint)
     * - 7 nodes * 2ms = ~14ms < 16ms budget with small margin
     * - Lower values increase latency; higher values risk frame drops
     */
    NODES_PER_BATCH: 7,
    /**
     * Throttle interval for scroll event handler (ms).
     *
     * Rationale:
     * - 100ms = 10 checks/second max, sufficient for bottom detection
     * - Scroll events can fire 60+ times/second during smooth scroll
     * - Reduces CPU overhead without perceptible lag
     */
    SCROLL_THROTTLE_MS: 100,
    /**
     * Timeout for runtime.sendMessage responses (ms).
     *
     * Rationale:
     * - Background script should respond nearly instantly (~5-20ms)
     * - 500ms provides generous margin for slow devices/busy main thread
     * - Prevents UI from hanging if background script is unresponsive
     */
    MESSAGE_TIMEOUT_MS: 500,
    /**
     * Retry delays for Chrome service worker wake-up (ms).
     *
     * Rationale:
     * - Chrome MV3 service workers can be inactive when popup opens
     * - sendMessage returns undefined if no listener registered yet
     * - Exponential backoff: 50ms, 100ms, 200ms allows progressive wake-up
     * - Total max wait: 350ms, within user tolerance for popup load
     */
    MESSAGE_RETRY_DELAYS_MS: [50, 100, 200],
    /**
     * Timeout for fetch proxy ready signal (ms).
     *
     * Rationale:
     * - Page script should signal ready within a few hundred ms
     * - 1000ms provides margin for slow page loads
     * - If timeout fires, proxy may still work (just missed the signal)
     */
    PROXY_READY_TIMEOUT_MS: 1e3,
    /**
     * Throttle interval for status bar DOM updates (ms).
     *
     * Rationale:
     * - 500ms reduces DOM writes during active chat streaming
     * - Prevents excessive repaints while still feeling responsive
     * - Status bar is informational, doesn't need real-time updates
     */
    STATUS_BAR_THROTTLE_MS: 500
  };
  var SUPPORT_URL = "https://github.com/Damascus96/Ebbli";

  // extension/src/shared/messages.ts
  async function sendMessageWithTimeout(message, timeoutMs = TIMING.MESSAGE_TIMEOUT_MS) {
    const isFirefox = typeof browser_polyfill_default.runtime.getBrowserInfo === "function";
    const isChrome = !isFirefox && typeof chrome !== "undefined" && !!chrome.runtime;
    const retryDelays = TIMING.MESSAGE_RETRY_DELAYS_MS;
    let lastError;
    for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
      try {
        const response = await Promise.race([
          browser_polyfill_default.runtime.sendMessage(message),
          new Promise(
            (_, reject) => setTimeout(() => reject(new Error("Message timeout")), timeoutMs)
          )
        ]);
        if (isChrome && chrome.runtime.lastError) {
          throw new Error(chrome.runtime.lastError.message ?? "Chrome runtime error");
        }
        if (response === void 0) {
          if (attempt < retryDelays.length) {
            await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
            continue;
          }
          throw new Error("Service worker not responding - received undefined after retries");
        }
        if ("error" in response && typeof response.error === "string") {
          throw new Error(`Ebbli handler error: ${response.error}`);
        }
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (lastError.message === "Message timeout" || lastError.message.startsWith("Ebbli handler error:")) {
          throw lastError;
        }
        if (attempt < retryDelays.length) {
          await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
          continue;
        }
        throw lastError;
      }
    }
    throw lastError ?? new Error("Message failed after retries");
  }

  // extension/src/popup/popup.ts
  function getRequiredElement(id) {
    const el = document.getElementById(id);
    if (!el) {
      throw new Error(`Required element #${id} not found`);
    }
    return el;
  }
  function getOptionalElement(id) {
    return document.getElementById(id);
  }
  var enableToggle;
  var keepSlider;
  var keepValue;
  var sliderTrackFill;
  var showStatusBarCheckbox;
  var collapseLongUserMessagesCheckbox;
  var debugCheckbox;
  var debugGroup;
  var statusElement;
  var supportLink;
  var retentionCard;
  var optionsCard;
  var sliderDebounceTimeout = null;
  var pendingKeepValue = null;
  var lastKeepUpdateTimestamp = 0;
  var SLIDER_SAVE_THROTTLE_MS = 150;
  var statusClearTimeout = null;
  function scheduleKeepUpdate(value, immediate = false) {
    if (immediate) {
      if (sliderDebounceTimeout !== null) {
        clearTimeout(sliderDebounceTimeout);
        sliderDebounceTimeout = null;
      }
      pendingKeepValue = null;
      lastKeepUpdateTimestamp = performance.now();
      void updateSettings({ keep: value });
      return;
    }
    const now = performance.now();
    if (now - lastKeepUpdateTimestamp >= SLIDER_SAVE_THROTTLE_MS) {
      if (sliderDebounceTimeout !== null) {
        clearTimeout(sliderDebounceTimeout);
        sliderDebounceTimeout = null;
      }
      pendingKeepValue = null;
      lastKeepUpdateTimestamp = now;
      void updateSettings({ keep: value }, { silent: true });
      return;
    }
    pendingKeepValue = value;
    if (sliderDebounceTimeout !== null) {
      clearTimeout(sliderDebounceTimeout);
    }
    const wait = Math.max(0, SLIDER_SAVE_THROTTLE_MS - (now - lastKeepUpdateTimestamp));
    sliderDebounceTimeout = window.setTimeout(() => {
      sliderDebounceTimeout = null;
      if (pendingKeepValue === null) {
        return;
      }
      lastKeepUpdateTimestamp = performance.now();
      const latestValue = pendingKeepValue;
      pendingKeepValue = null;
      void updateSettings({ keep: latestValue }, { silent: true });
    }, wait);
  }
  function updateSliderTrackFill() {
    const min = parseInt(keepSlider.min, 10);
    const max = parseInt(keepSlider.max, 10);
    const value = parseInt(keepSlider.value, 10);
    const percentage = (value - min) / (max - min) * 100;
    sliderTrackFill.style.width = `${percentage}%`;
  }
  async function isDevMode() {
    try {
      const response = await fetch(browser_polyfill_default.runtime.getURL(".dev"));
      return response.ok;
    } catch {
      return false;
    }
  }
  async function reloadActiveChatGPTTab() {
    try {
      const tabs = await browser_polyfill_default.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0];
      if (activeTab?.id && activeTab.url) {
        const isChatGPT = activeTab.url.includes("chat.openai.com") || activeTab.url.includes("chatgpt.com");
        if (isChatGPT) {
          await browser_polyfill_default.tabs.reload(activeTab.id);
        }
      }
    } catch (error) {
      console.error("Failed to reload tab:", error);
    }
  }
  async function initialize() {
    enableToggle = getRequiredElement("enableToggle");
    keepSlider = getRequiredElement("keepSlider");
    keepValue = getRequiredElement("keepValue");
    sliderTrackFill = getRequiredElement("sliderTrackFill");
    statusElement = getRequiredElement("status");
    supportLink = getRequiredElement("supportLink");
    showStatusBarCheckbox = getOptionalElement("showStatusBarCheckbox");
    collapseLongUserMessagesCheckbox = getOptionalElement(
      "collapseLongUserMessagesCheckbox"
    );
    debugCheckbox = getOptionalElement("debugCheckbox");
    debugGroup = getOptionalElement("debugGroup");
    retentionCard = getOptionalElement("retentionCard");
    optionsCard = getOptionalElement("optionsCard");
    const devMode = await isDevMode();
    if (devMode && debugGroup) {
      debugGroup.style.display = "block";
    }
    const versionElement = getOptionalElement("version");
    if (versionElement) {
      const manifest = browser_polyfill_default.runtime.getManifest();
      versionElement.textContent = `v${manifest.version}`;
    }
    await loadSettings();
    enableToggle.addEventListener("change", () => void handleEnableToggle());
    keepSlider.addEventListener("input", handleKeepSliderInput);
    keepSlider.addEventListener("change", () => void handleKeepSliderChange());
    keepSlider.addEventListener("mousedown", () => {
      keepValue.classList.add("is-dragging");
    });
    keepSlider.addEventListener("mouseup", () => {
      keepValue.classList.remove("is-dragging");
    });
    if (showStatusBarCheckbox) {
      showStatusBarCheckbox.addEventListener("change", handleShowStatusBarToggle);
    }
    if (collapseLongUserMessagesCheckbox) {
      collapseLongUserMessagesCheckbox.addEventListener("change", handleCollapseLongUserMessagesToggle);
    }
    if (debugCheckbox) {
      debugCheckbox.addEventListener("change", handleDebugToggle);
    }
    supportLink.addEventListener("click", handleSupportClick);
  }
  async function loadSettings() {
    try {
      const response = await sendMessageWithTimeout({
        type: "GET_SETTINGS"
      });
      const settings = response.settings;
      enableToggle.checked = settings.enabled;
      keepSlider.value = settings.keep.toString();
      keepValue.textContent = settings.keep.toString();
      keepSlider.setAttribute("aria-valuenow", settings.keep.toString());
      updateSliderTrackFill();
      if (showStatusBarCheckbox) {
        showStatusBarCheckbox.checked = settings.showStatusBar;
      }
      if (collapseLongUserMessagesCheckbox) {
        collapseLongUserMessagesCheckbox.checked = settings.collapseLongUserMessages;
      }
      if (debugCheckbox) {
        debugCheckbox.checked = settings.debug;
      }
      updateDisabledState(settings.enabled);
    } catch (error) {
      showStatus("Failed to load settings", true);
      console.error("Failed to load settings:", error);
    }
  }
  async function updateSettings(updates, options = {}) {
    try {
      await sendMessageWithTimeout({
        type: "SET_SETTINGS",
        payload: updates
      });
      if (!options.silent) {
        showStatus("Settings saved");
      }
    } catch (error) {
      showStatus("Failed to save settings", true);
      console.error("Failed to update settings:", error);
    }
  }
  async function handleEnableToggle() {
    const enabled = enableToggle.checked;
    await updateSettings({ enabled });
    updateDisabledState(enabled);
    await reloadActiveChatGPTTab();
  }
  function handleKeepSliderInput() {
    const value = parseInt(keepSlider.value, 10);
    keepValue.textContent = value.toString();
    keepSlider.setAttribute("aria-valuenow", value.toString());
    updateSliderTrackFill();
    scheduleKeepUpdate(value);
  }
  async function handleKeepSliderChange() {
    const value = parseInt(keepSlider.value, 10);
    if (sliderDebounceTimeout !== null) {
      clearTimeout(sliderDebounceTimeout);
      sliderDebounceTimeout = null;
    }
    pendingKeepValue = null;
    await updateSettings({ keep: value });
    await reloadActiveChatGPTTab();
  }
  function handleShowStatusBarToggle() {
    if (showStatusBarCheckbox) {
      void updateSettings({ showStatusBar: showStatusBarCheckbox.checked });
    }
  }
  function handleCollapseLongUserMessagesToggle() {
    if (collapseLongUserMessagesCheckbox) {
      void updateSettings({ collapseLongUserMessages: collapseLongUserMessagesCheckbox.checked });
    }
  }
  function handleDebugToggle() {
    if (debugCheckbox) {
      void updateSettings({ debug: debugCheckbox.checked });
    }
  }
  function handleSupportClick() {
    void browser_polyfill_default.tabs.create({ url: SUPPORT_URL });
  }
  function showStatus(message, isError = false) {
    if (statusClearTimeout !== null) {
      clearTimeout(statusClearTimeout);
    }
    statusElement.textContent = message;
    statusElement.classList.toggle("error", isError);
    statusClearTimeout = window.setTimeout(() => {
      statusClearTimeout = null;
      statusElement.textContent = "";
      statusElement.classList.remove("error");
    }, 3e3);
  }
  function updateDisabledState(enabled) {
    const cards = [retentionCard, optionsCard];
    for (const card of cards) {
      if (!card) continue;
      if (enabled) {
        card.classList.remove("disabled");
      } else {
        card.classList.add("disabled");
      }
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void initialize());
  } else {
    void initialize();
  }
})();
//# sourceMappingURL=popup.js.map
