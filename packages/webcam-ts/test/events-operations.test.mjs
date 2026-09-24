import test from "node:test";
import assert from "node:assert/strict";

import {
  CameraEventHub,
  stopStream,
} from "../dist/testing/index.js";

test("listener failures do not prevent later listeners", () => {
  const hub = new CameraEventHub();
  const received = [];
  hub.subscribe(() => {
    throw new Error("consumer failure");
  });
  hub.subscribe((event) => received.push(event.type));

  assert.doesNotThrow(() => {
    hub.emit({ type: "operation-completed", operation: "start", operationId: 1 });
  });
  assert.deepEqual(received, ["operation-completed"]);
});

test("unsubscribe is idempotent", () => {
  const hub = new CameraEventHub();
  let calls = 0;
  const unsubscribe = hub.subscribe(() => calls++);
  unsubscribe();
  unsubscribe();
  hub.emit({ type: "operation-completed", operation: "stop", operationId: 1 });
  assert.equal(calls, 0);
});

test("stopStream stops each track only once", () => {
  const track = { stopCalls: 0, stop() { this.stopCalls++; } };
  const stream = { getTracks() { return [track]; } };
  stopStream(stream);
  stopStream(stream);
  assert.equal(track.stopCalls, 1);
});
