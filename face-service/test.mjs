import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import jpeg from "jpeg-js";

const dataDir = path.join(os.tmpdir(), `vms-face-${Date.now()}`);
process.env.FACE_DATA_DIR = dataDir;
process.env.FACE_PORT = "0";

function image(paint) {
  const width = 160;
  const height = 160;
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = paint(x, y);
      const index = (y * width + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
  const encoded = jpeg.encode({ data, width, height }, 90);
  return `data:image/jpeg;base64,${Buffer.from(encoded.data).toString("base64")}`;
}

test("enrollment matches a second capture and rejects a different pattern", async (t) => {
  const { createFaceServer } = await import("./server.mjs");
  const server = createFaceServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const frameA = image((x, y) => (x * 3 + y) % 200 + 20);
  const frameB = image((x, y) => (x * 3 + y + 4) % 200 + 20);
  const otherA = image((x, y) => (y * 5 + 30) % 180 + 40);
  const otherB = image((x, y) => (y * 5 + 36) % 180 + 40);
  const blank = image(() => 20);

  const poor = await fetch(`${base}/face/enroll`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image_a: blank, image_b: blank, subject_ref: "blank", liveness_required: true }),
  }).then((response) => response.json());
  assert.equal(poor.accepted, false);

  const enrolled = await fetch(`${base}/face/enroll`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image_a: frameA, image_b: frameB, subject_ref: "visitor-1", liveness_required: true }),
  }).then((response) => response.json());
  assert.equal(enrolled.accepted, true, JSON.stringify(enrolled));
  assert.ok(enrolled.template_ref);
  assert.equal(Object.hasOwn(enrolled, "vector"), false);

  const matched = await fetch(`${base}/face/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      image_a: frameA,
      image_b: frameB,
      template_ref: enrolled.template_ref,
      liveness_required: true,
    }),
  }).then((response) => response.json());
  assert.equal(matched.match, true, JSON.stringify(matched));

  const mismatch = await fetch(`${base}/face/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      image_a: otherA,
      image_b: otherB,
      template_ref: enrolled.template_ref,
      liveness_required: true,
    }),
  }).then((response) => response.json());
  assert.equal(mismatch.match, false, JSON.stringify(mismatch));
  assert.equal(mismatch.reason, "MISMATCH");
});
