import "server-only";

import { timingSafeEqual } from "node:crypto";

export function authoriseCronRequest(request: Request): boolean {
  if (request.headers.get("x-vercel-cron") !== "1") {
    return false;
  }

  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return false;
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return false;
  }

  const expected = `Bearer ${secret}`;
  try {
    const a = Buffer.from(authHeader);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
