import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { commitImport } from "@/lib/data/imports";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid import ID" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("imports")
    .select("id")
    .eq("id", id)
    .eq("org_id", user.org_id)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  if (!existing) {
    // Already cancelled (or otherwise removed) between bursts — tell the
    // client to stop draining rather than surfacing this as an error.
    return NextResponse.json({ ok: true, hasMore: false, cancelled: true });
  }

  try {
    const result = await commitImport(id);
    return NextResponse.json({
      ok: true,
      hasMore: result.hasMore,
      summary: result.summary,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Import chunk failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
