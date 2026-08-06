import test from "node:test";
import assert from "node:assert/strict";

import { CameraError } from "../dist/index.js";
import {
  BrowserMediaDevicesAdapter,
  normalizeBrowserError,
} from "../dist/testing/index.js";

test("root package imports without browser globals", async () => {
  const module = await import("../dist/index.js");
  assert.equal(typeof module.CameraError, "function");
});

test("browser adapter reports unsupported runtime lazily", async () => {
  const originalNavigator = globalThis.navigator;
  try {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: undefined });
    const adapter = new BrowserMediaDevicesAdapter();
    await assert.rejects(
      () => adapter.open({ video: true }),
      (error) => error instanceof CameraError && error.code === "UNSUPPORTED_RUNTIME",
    );
  } finally {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: originalNavigator });
  }
});

test("browser errors are normalized once at the platform boundary", () => {
  const denied = Object.assign(new Error("denied"), { name: "NotAllowedError" });
  const error = normalizeBrowserError(denied, "start");
  assert.equal(error.code, "PERMISSION_DENIED");
  assert.equal(error.operation, "start");
  assert.equal(error.cause, denied);
});
