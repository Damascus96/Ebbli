import { describe, expect, it } from 'vitest';

import { isEbbliRejection } from '../../extension/src/content/rejection-filter';

describe('isEbbliRejection', () => {
  it('returns false for empty/unknown reasons', () => {
    expect(isEbbliRejection(undefined)).toBe(false);
    expect(isEbbliRejection(null)).toBe(false);
    expect(isEbbliRejection(123)).toBe(false);
    expect(isEbbliRejection({})).toBe(false);
  });

  it('matches when reason string contains EB:', () => {
    expect(isEbbliRejection('EB: boom')).toBe(true);
  });

  it('does not match EB: in message when extension URL is provided but not present', () => {
    const prefix = 'chrome-extension://abc123/';
    expect(isEbbliRejection('EB: boom', prefix)).toBe(false);
  });

  it('matches when Error.stack contains the extension base URL', () => {
    const prefix = 'chrome-extension://abc123/';
    const err = new Error('nope');
    // Simulate a stack that points at our bundled content script URL.
    err.stack = `Error: nope\n    at doThing (${prefix}dist/content.js:1:1)`;
    expect(isEbbliRejection(err, prefix)).toBe(true);
  });

  it('does not match non-Ebbli errors by default', () => {
    const err = new Error('Some site error');
    err.stack = `Error: Some site error\n    at foo (https://chatgpt.com/app.js:1:1)`;
    expect(isEbbliRejection(err)).toBe(false);
  });
});
