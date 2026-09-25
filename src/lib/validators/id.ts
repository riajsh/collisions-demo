import { z } from "zod";

/** Accepts any Postgres uuid string (seed data uses non-RFC4122 test IDs). */
export const postgresUuidSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "Invalid ID",
  );
