"use server";

import { revalidatePath } from "next/cache";

import { inferCoAttendanceForOrg, inferSameCompanyConnections } from "@/lib/computed/infer-connections";
import { applyPeerCompanyEnrichment } from "@/lib/enrichment/company-enrichment";
import { requireAdmin, getOrgId } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function inferAllCoAttendanceAction() {
  await requireAdmin();

  try {
    const result = await inferCoAttendanceForOrg();
    revalidatePath("/profiles");
    revalidatePath("/connect");
    revalidatePath("/events");
    return { success: true as const, ...result };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to run inference",
      created: 0,
      skipped: 0,
    };
  }
}

export async function inferSameCompanyAction() {
  await requireAdmin();

  try {
    const result = await inferSameCompanyConnections();
    revalidatePath("/profiles");
    revalidatePath("/connect");
    return { success: true as const, ...result };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to run inference",
      created: 0,
      skipped: 0,
    };
  }
}

export async function applyPeerCompanyEnrichmentAction() {
  await requireAdmin();

  try {
    const supabase = await createClient();
    const orgId = await getOrgId();
    const result = await applyPeerCompanyEnrichment(supabase, orgId);
    revalidatePath("/profiles");
    revalidatePath("/admin");
    revalidatePath("/admin/calendar-sync/review");
    return { success: true as const, ...result };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to apply company enrichment",
      updated: 0,
      skipped: 0,
    };
  }
}
