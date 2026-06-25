// Browser polyfill for process.env in development
if (typeof (globalThis as any).process === "undefined") {
  (globalThis as any).process = { env: {} };
}
export {};
