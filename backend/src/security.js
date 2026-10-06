import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("Set JWT_SECRET in .env to a random value of at least 16 characters.");
  }
  return secret;
}

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateTotpSecret() {
  const bytes = randomBytes(20);
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
  let output = "";
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, "0");
    output += BASE32[parseInt(chunk, 2)];
  }
  return output;
}

export function otpauthUrl(email, secret) {
  return `otpauth://totp/VMS:${encodeURIComponent(email)}?secret=${secret}&issuer=VMS&digits=6&period=30`;
}

export function assertPasswordStrength(password) {
  if (typeof password !== "string" || password.length < 10) return "Password must be at least 10 characters.";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return "Password must include a letter and a number.";
  return null;
}

function decodeSecret(secret) {
  const compact = String(secret || "").replace(/\s/g, "").toUpperCase();
  if (/^[A-Z2-7]+=*$/.test(compact) && compact.length >= 16) {
    let bits = "";
    for (const char of compact.replace(/=+$/, "")) {
      bits += BASE32.indexOf(char).toString(2).padStart(5, "0");
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
    return Buffer.from(bytes);
  }
  return Buffer.from(String(secret));
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const actual = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export function signToken(payload, ttlSeconds = 60 * 60 * 12) {
  const body = {
    ...payload,
    jti: randomBytes(16).toString("hex"),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const data = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = createHmac("sha256", jwtSecret()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyToken(token) {
  if (!token || !token.includes(".")) return null;
  const [data, sig] = token.split(".");
  const expected = createHmac("sha256", jwtSecret()).update(data).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/** RFC 6238 TOTP. Secrets created by this app are base32 and work in authenticator apps. */
export function totp(secret, timeMs = Date.now()) {
  const counter = Math.floor(timeMs / 30000);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac("sha1", decodeSecret(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(bin % 1000000).padStart(6, "0");
}

export function verifyTotp(secret, code, timeMs = Date.now()) {
  const normalized = String(code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  for (const skew of [-30000, 0, 30000]) {
    if (totp(secret, timeMs + skew) === normalized) return true;
  }
  return false;
}

export function newId(prefix) {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

export function passCode() {
  return `VMS-${randomBytes(4).toString("hex").toUpperCase()}`;
}
