import test from "node:test";
import assert from "node:assert/strict";

import {
  CameraEventHub,
  OperationController,
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

test("a newer switch supersedes an older lease", () => {
  const controller = new OperationController();
  const first = controller.begin("switch");
  const second = controller.begin("switch");
  assert.equal(first.isCurrent(), false);
  assert.equal(second.isCurrent(), true);
  assert.equal(second.id, first.id + 1);
});

test("invalidated lease throws OPERATION_SUPERSEDED", () => {
  const controller = new OperationController();
  const lease = controller.begin("switch");
  controller.invalidate();
  assert.throws(
    () => lease.throwIfInvalid(),
    (error) => error.code === "OPERATION_SUPERSEDED",
  );
});

test("lease invalidation settles an observable one-shot reason", async () => {
  for (const [code, recoverable] of [
    ["OPERATION_ABORTED", true],
    ["OPERATION_SUPERSEDED", true],
    ["DISPOSED", false],
  ]) {
    const controller = new OperationController();
    const lease = controller.begin("start");
    const invalidated = lease.whenInvalidated();

    controller.invalidate(code);
    const error = await invalidated;

    assert.equal(error.code, code);
    assert.equal(error.operation, "start");
    assert.equal(error.recoverable, recoverable);
    assert.deepEqual(error.context, { operationId: lease.id });
  }
});

test("lease invalidation remains settled with the first reason", async () => {
  const controller = new OperationController();
  const lease = controller.begin("switch");

  lease.invalidate("OPERATION_ABORTED");
  lease.invalidate("DISPOSED");

  const first = await lease.whenInvalidated();
  const second = await lease.whenInvalidated();
  assert.strictEqual(second, first);
  assert.equal(first.code, "OPERATION_ABORTED");
  assert.throws(
    () => lease.throwIfInvalid(),
    (error) => error.code === "OPERATION_ABORTED",
  );
});

test("stopStream stops each track only once", () => {
  const track = { stopCalls: 0, stop() { this.stopCalls++; } };
  const stream = { getTracks() { return [track]; } };
  stopStream(stream);
  stopStream(stream);
  assert.equal(track.stopCalls, 1);
});
