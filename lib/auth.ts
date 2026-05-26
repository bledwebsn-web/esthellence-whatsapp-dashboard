type SessionPayload = {
  username: string;
  exp: number;
};

const DEFAULT_COOKIE_NAME = "esthellence_admin_session";
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

export function getAuthCookieName() {
  return process.env.AUTH_COOKIE_NAME ?? DEFAULT_COOKIE_NAME;
}

function getAuthSecret() {
  return process.env.AUTH_SESSION_SECRET ?? "";
}

function encodeBase64Utf8(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  if (typeof globalThis.btoa === "function") {
    return globalThis.btoa(binary);
  }

  return Buffer.from(value, "utf8").toString("base64");
}

function decodeBase64Utf8(value: string) {
  if (typeof globalThis.atob === "function") {
    const binary = globalThis.atob(value);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  return Buffer.from(value, "base64").toString("utf8");
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return result === 0;
}

async function hmacSha256Hex(message: string) {
  const secret = getAuthSecret();

  if (!secret) {
    throw new Error("AUTH_SESSION_SECRET is missing");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );

  return bytesToHex(new Uint8Array(signature));
}

export async function createSessionToken(username: string) {
  const payload: SessionPayload = {
    username,
    exp: Date.now() + SESSION_DURATION_MS,
  };

  const payloadBase64 = encodeBase64Utf8(JSON.stringify(payload));
  const signature = await hmacSha256Hex(payloadBase64);

  return `${payloadBase64}.${signature}`;
}

export async function verifySessionToken(token: string) {
  try {
    const [payloadBase64, signature] = token.split(".");

    if (!payloadBase64 || !signature) {
      return null;
    }

    const expectedSignature = await hmacSha256Hex(payloadBase64);

    if (!constantTimeEqual(signature, expectedSignature)) {
      return null;
    }

    const payload = JSON.parse(decodeBase64Utf8(payloadBase64)) as Partial<SessionPayload>;

    if (
      typeof payload.username !== "string" ||
      typeof payload.exp !== "number" ||
      payload.exp <= Date.now()
    ) {
      return null;
    }

    return {
      username: payload.username,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}
