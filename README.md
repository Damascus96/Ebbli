# Ebbli

*Signals drifting through the current.*

Long ChatGPT conversations eventually slow the browser down. Every message stays in the DOM. After a few hundred exchanges, scrolling lags, typing stutters, and the tab quietly starts consuming the machine.

Ebbli fixes this by intercepting ChatGPT's API responses and trimming older messages before the page ever renders them. The DOM stays lean. The conversation stays intact on OpenAI's servers. Nothing is deleted — only the view is optimized.

No telemetry. No network requests. Everything runs locally.

---

## How it works

Ebbli injects a page script at `document_start` that patches `window.fetch`. When ChatGPT receives a conversation response, Ebbli intercepts the JSON, counts messages by role, keeps only the most recent N, and returns the modified response before React renders anything. Because trimming happens before rendering, the DOM never grows large enough to cause problems.

The full conversation remains on OpenAI's servers. A page refresh restores it.

---

## Features

**Performance**
Fetch proxy architecture with no DOM flash. Message-based counting instead of node counting. Configurable limits from 1 to 100 messages. Optional Ultra Lean Mode for very large threads.

**Privacy**
No analytics, no telemetry, no external services. Settings stored locally via `browser.storage.local`.

**Controls**
Popup interface for adjusting trim limits. Optional on-page status indicator showing current trim statistics.

---

## Who this is for

People who keep very long ChatGPT threads — debugging sessions, multi-hour research, extended coding work — and notice the browser getting slower the longer the conversation runs.

---

## Installation

**Firefox**
Download the signed `.xpi` from the Releases page and open it in Firefox. Firefox will prompt you to install.

**Chrome**
Download the ZIP from Releases.

1. Open `chrome://extensions`
2. Enable Developer Mode
3. Click Load unpacked
4. Select the `extension/` folder

---

## Development

Requires Node.js >= 24 and npm >= 10.
```bash
npm install
npm run build:firefox
npm run build:chrome
```
```
extension/
  src/
    content/
    page/
    popup/
    background/
    shared/
  dist/
  icons/
```

---

## Architecture

Ebbli uses a fetch interception approach rather than post-render DOM manipulation.

1. A page script is injected at `document_start`
2. The script patches `window.fetch`
3. ChatGPT API responses are intercepted
4. Conversation JSON is parsed and trimmed by message count
5. A modified response is returned to the page before React renders

This prevents the browser from ever building large message trees while keeping the full conversation intact on the server. The tradeoff is intentional: trimming before render means no flash of unoptimized content, but it requires patching the fetch layer rather than working in the DOM directly.

---

## Compatibility

Firefox >= 115, Chrome >= 120. Windows, macOS, Linux.

---

## Attribution

Ebbli is built on [LightSession](https://github.com/11me/light-session), an open source project by 11me, extended with additional architecture, UI, and performance changes.

The name follows the Hiraeth House naming pattern — *ebb*, as in the pull of a current receding, with *li* as the closing syllable shared across all products in the family.

---

Ebbli is a Hiraeth House product.

---

## License

MIT
