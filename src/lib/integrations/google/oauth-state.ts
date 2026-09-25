import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const STATE_COOKIE = "google_oauth_state";
const STATE_TTL_MS = 10 * 60 * 1000;

type OAuthStatePayload = {
  nonce: string;
  userId: string;
  provider: "gmail" | "calendar";
  issuedAt: number;
};

function getStateSecret(): string {
  const secret = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!secret) {
    throw new Error("TOKEN_ENCRYPTION_KEY is not configured");
  }

  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getStateSecret()).update(payload).digest("base64url");
}

export function createOAuthState(userId: string, provider: OAuthStatePayload["provider"]): {
  state: string;
  cookieValue: string;
} {
  const payload: OAuthStatePayload = {
    nonce: randomBytes(16).toString("base64url"),
    userId,
    provider,
    issuedAt: Date.now(),
  };

  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(encoded);

  return {
    state: `${encoded}.${signature}`,
    cookieValue: `${encoded}.${signature}`,
  };
}

export function verifyOAuthState(
  state: string | null,
  cookieValue: string | undefined,
  provider: OAuthStatePayload["provider"],
  userId: string,
): boolean {
  if (!state || !cookieValue || state !== cookieValue) {
    return false;
  }

  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) {
    return false;
  }

  const expected = sign(encoded);
  // Decode from base64url before comparing so we compare the actual signature
  // bytes, not the base64url text representation (#7).
  const sigBuffer = Buffer.from(signature, "base64url");
  const expectedBuffer = Buffer.from(expected, "base64url");

  if (
    sigBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    return false;
  }

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as OAuthStatePayload;
  } catch {
    return false;
  }

  if (payload.provider !== provider || payload.userId !== userId) {
    return false;
  }

  return Date.now() - payload.issuedAt <= STATE_TTL_MS;
}

export { STATE_COOKIE };
