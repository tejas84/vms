/**
 * Same PoC contract as app.py, runnable with Node when the Python stack is not installed.
 * Detection is a center crop. Quality, two-frame liveness, and 1:1 comparison match the Python service.
 * Raw templates are stored locally and are never returned.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";

const POLICY_VERSION = "poc-embedding-1";
const THRESHOLD = Number(process.env.MATCH_THRESHOLD || 0.82);
const PORT = Number(process.env.FACE_PORT || 8090);
const DATA = path.resolve(process.env.FACE_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), "data"));
const STORE = path.join(DATA, "templates.json");

function loadStore() {
  if (!fs.existsSync(STORE)) return {};
  return JSON.parse(fs.readFileSync(STORE, "utf8"));
}

function saveStore(store) {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(STORE, JSON.stringify(store));
}

function decodeDataUrl(payload) {
  if (!payload) {
    const error = new Error("Image payload is empty.");
    error.status = 400;
    error.code = "BAD_IMAGE";
    throw error;
  }
  const raw = payload.startsWith("data:") ? payload.split(",", 2)[1] : payload;
  const buffer = Buffer.from(raw, "base64");
  if (buffer[0] === 0x89 && buffer[1] === 0x50) {
    const png = PNG.sync.read(buffer);
    return { width: png.width, height: png.height, data: png.data };
  }
  const decoded = jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true });
  return { width: decoded.width, height: decoded.height, data: decoded.data };
}

function sample(image, x, y) {
  const xx = Math.max(0, Math.min(image.width - 1, Math.round(x)));
  const yy = Math.max(0, Math.min(image.height - 1, Math.round(y)));
  const index = (yy * image.width + xx) * 4;
  const r = image.data[index];
  const g = image.data[index + 1];
  const b = image.data[index + 2];
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function analyze(payload) {
  const image = decodeDataUrl(payload);
  let sum = 0;
  let sumSq = 0;
  const count = image.width * image.height;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const value = sample(image, x, y);
      sum += value;
      sumSq += value * value;
    }
  }
  const brightness = sum / count;
  const variance = sumSq / count - brightness * brightness;
  const side = Math.max(8, Math.floor(Math.min(image.width, image.height) * 0.62));
  const originX = Math.floor((image.width - side) / 2);
  const originY = Math.floor((image.height - side) / 2);
  const preview = new Float32Array(32 * 32);
  for (let y = 0; y < 32; y += 1) {
    for (let x = 0; x < 32; x += 1) {
      preview[y * 32 + x] = sample(
        image,
        originX + ((x + 0.5) * side) / 32,
        originY + ((y + 0.5) * side) / 32,
      );
    }
  }
  const usable = brightness >= 45 && brightness <= 220 && variance >= 80;
  const quality = Math.max(0, Math.min(100, usable ? variance / 25 : variance / 80));
  if (!usable) {
    return { ok: false, reason: variance < 80 ? "POOR_QUALITY" : "POOR_QUALITY", quality, preview: null, vector: null };
  }
  let norm = 0;
  for (const value of preview) norm += value * value;
  norm = Math.sqrt(norm) + 1e-8;
  const vector = Array.from(preview, (value) => value / norm);
  return { ok: true, reason: "OK", quality, preview, vector };
}

function cosine(a, b) {
  let dot = 0;
  let left = 0;
  let right = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    left += a[i] * a[i];
    right += b[i] * b[i];
  }
  return dot / (Math.sqrt(left) * Math.sqrt(right) + 1e-8);
}

function liveness(first, second, required) {
  if (!required) return [true, "OK"];
  if (!second?.preview || !first?.preview) return [false, "LIVENESS_FAILED"];
  if (!first.ok || !second.ok) return [false, first.ok ? second.reason : first.reason];
  let diff = 0;
  for (let i = 0; i < first.preview.length; i += 1) diff += Math.abs(first.preview[i] - second.preview[i]);
  diff /= first.preview.length;
  const same = cosine(first.vector, second.vector) >= 0.9;
  if (same && diff >= 0.35) return [true, "OK"];
  return [false, "LIVENESS_FAILED"];
}

function body(extra) {
  return { threshold: THRESHOLD, policy_version: POLICY_VERSION, ...extra };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (error) {
        reject(error);
      }
    });
  });
}

export function createFaceServer() {
  return http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/health") {
        return send(res, 200, { status: "ok", detector: "center", policy: POLICY_VERSION, threshold: THRESHOLD });
      }
      if (req.method === "DELETE" && req.url.startsWith("/face/templates/")) {
        const templateRef = decodeURIComponent(req.url.split("/").pop());
        const store = loadStore();
        const existed = Object.prototype.hasOwnProperty.call(store, templateRef);
        delete store[templateRef];
        saveStore(store);
        return send(res, 200, { deleted: existed });
      }
      const payload = await readJson(req);
      if (req.method === "POST" && req.url === "/face/enroll") return send(res, 200, enroll(payload));
      if (req.method === "POST" && req.url === "/face/verify") return send(res, 200, verify(payload));
      if (req.method === "POST" && req.url === "/face/quality") {
        const first = analyze(payload.image_a);
        return send(res, 200, body({ accepted: first.ok, reason: first.reason, quality_score: first.quality, detector: "center" }));
      }
      return send(res, 404, { detail: { code: "NOT_FOUND", message: "Unknown face route." } });
    } catch (error) {
      const status = error.status || 400;
      send(res, status, { detail: { code: error.code || "BAD_IMAGE", message: error.message || "Image could not be decoded." } });
    }
  });
}

function enroll(payload) {
  const first = analyze(payload.image_a);
  const second = payload.image_b ? analyze(payload.image_b) : null;
  if (!first.ok) {
    return body({ accepted: false, template_ref: null, quality_score: first.quality, liveness_passed: false, reason: first.reason, match: false, score: 0 });
  }
  const [live, liveReason] = liveness(first, second, payload.liveness_required !== false);
  if (!live) {
    return body({ accepted: false, template_ref: null, quality_score: first.quality, liveness_passed: false, reason: liveReason, match: false, score: 0 });
  }
  const templateRef = randomUUID();
  const store = loadStore();
  store[templateRef] = {
    vector: first.vector,
    subject_ref: payload.subject_ref || null,
    created_at: new Date().toISOString(),
    policy_version: POLICY_VERSION,
  };
  saveStore(store);
  return body({
    accepted: true,
    template_ref: templateRef,
    quality_score: Number(first.quality.toFixed(2)),
    liveness_passed: true,
    reason: "OK",
    match: true,
    score: 1,
  });
}

function verify(payload) {
  if (!payload.template_ref) {
    const error = new Error("template_ref is required.");
    error.status = 400;
    error.code = "TEMPLATE_REQUIRED";
    throw error;
  }
  const store = loadStore();
  const record = store[payload.template_ref];
  if (!record) return body({ match: false, score: 0, quality_score: 0, liveness_passed: false, reason: "TEMPLATE_NOT_FOUND", accepted: false });
  const first = analyze(payload.image_a);
  const second = payload.image_b ? analyze(payload.image_b) : null;
  if (!first.ok) return body({ match: false, score: 0, quality_score: first.quality, liveness_passed: false, reason: first.reason, accepted: false });
  const [live, liveReason] = liveness(first, second, payload.liveness_required !== false);
  if (payload.liveness_required !== false && !live) {
    return body({ match: false, score: 0, quality_score: Number(first.quality.toFixed(2)), liveness_passed: false, reason: liveReason, accepted: false });
  }
  const score = cosine(first.vector, record.vector);
  const matched = score >= THRESHOLD;
  return body({
    match: matched,
    score: Number(score.toFixed(4)),
    quality_score: Number(first.quality.toFixed(2)),
    liveness_passed: live,
    reason: matched ? "MATCH" : "MISMATCH",
    accepted: matched,
  });
}

function send(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

const isMain = process.argv[1] && process.argv[1].endsWith("server.mjs");
if (isMain) {
  createFaceServer().listen(PORT, "127.0.0.1", () => {
    console.log(`VMS face service listening on http://127.0.0.1:${PORT}`);
  });
}
