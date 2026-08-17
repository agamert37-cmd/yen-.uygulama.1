import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement matchMedia - xterm.js calls it during Terminal.open()
// to detect the display's device pixel ratio, so any test that mounts
// XtermLogViewer needs this standard stub in place.
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
