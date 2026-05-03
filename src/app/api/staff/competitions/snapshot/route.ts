import { NextResponse, type NextRequest } from "next/server";
import { getCompetitionSnapshot } from "@/lib/db";
import { requireStaff } from "@/lib/server-auth";
import { createServiceRoleSupabaseClient } from "@/lib/server-supabase";

export const dynamic = "force-dynamic";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load competition snapshot.";
}

function getErrorStatus(message: string) {
  if (/not found/i.test(message)) {
    return 404;
  }

  return 500;
}

export async function GET(request: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) {
    return auth.response;
  }

  const identifier =
    request.nextUrl.searchParams.get("identifier") ??
    request.nextUrl.searchParams.get("slug") ??
    "";

  if (!identifier.trim()) {
    return NextResponse.json({ error: "Competition identifier is required." }, { status: 400 });
  }

  try {
    const adminSupabase = createServiceRoleSupabaseClient();
    const snapshot = await getCompetitionSnapshot(identifier, { readClient: adminSupabase });

    return NextResponse.json(
      { snapshot },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    const message = getErrorMessage(error);
    console.error("STAFF SNAPSHOT ERROR:", error);
    return NextResponse.json({ error: message }, { status: getErrorStatus(message) });
  }
}
