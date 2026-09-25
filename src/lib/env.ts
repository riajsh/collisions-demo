import "server-only";

import { z } from "zod";

import { publicEnv } from "@/lib/env/public";

const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DEFAULT_ORG_SLUG: z.string().min(1),
});

function parseServerEnv() {
  const parsed = serverEnvSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    DEFAULT_ORG_SLUG: process.env.DEFAULT_ORG_SLUG,
  });

  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid server environment variables:\n${formatted}`);
  }

  return parsed.data;
}

const serverEnv = parseServerEnv();

export const env = {
  ...publicEnv,
  ...serverEnv,
};
