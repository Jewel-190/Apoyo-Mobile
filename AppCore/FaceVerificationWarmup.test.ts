import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FACE_VERIFY_CLIENT_TIMEOUT_MS,
  FACE_VERIFY_EDGE_TIMEOUT_MS,
  comprefaceWarmupSucceeded,
} from "./FaceVerificationTimeouts";

describe("face verification timeout policy", () => {
  it("gives the client more time than the edge function", () => {
    assert.equal(FACE_VERIFY_EDGE_TIMEOUT_MS, 180_000);
    assert.ok(FACE_VERIFY_CLIENT_TIMEOUT_MS > FACE_VERIFY_EDGE_TIMEOUT_MS);
  });
});

describe("CompreFace warmup rules", () => {
  it("treats a completed comparison as warm, even if no face was found", () => {
    assert.equal(comprefaceWarmupSucceeded(null), true);
    assert.equal(comprefaceWarmupSucceeded("NO_FACE"), true);
  });

  it("does not mark CompreFace warm after a timeout or transport error", () => {
    assert.equal(comprefaceWarmupSucceeded("COMPREFACE_TIMEOUT"), false);
    assert.equal(comprefaceWarmupSucceeded("COMPREFACE_ERROR"), false);
    assert.equal(
      comprefaceWarmupSucceeded("COMPREFACE_API_KEY not configured"),
      false
    );
  });
});
