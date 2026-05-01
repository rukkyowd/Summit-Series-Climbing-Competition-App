import { NextResponse, type NextRequest } from "next/server";
import { createRouteSupabaseClient, createServiceRoleSupabaseClient } from "@/lib/server-supabase";

const RESET_SECRET = process.env["CRON_SECRET"] ?? process.env["DEMO_RESET_SECRET"] ?? null;
const PUBLIC_DEMO_PATH_PREFIXES = ["/demo", "/staff/demo"] as const;

type DemoResetRequest = {
  mode?: string;
  competitionId?: string | string[] | null;
};

async function isAuthorizedAdminRequest(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (RESET_SECRET && authorization === `Bearer ${RESET_SECRET}`) {
    return true;
  }

  const supabase = createRouteSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return false;
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return profile?.role === "admin";
}

function isPublicDemoResetRequest(request: NextRequest, payload: DemoResetRequest | null) {
  if (request.method !== "POST" || payload?.mode !== "public_demo") {
    return false;
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return false;
  }

  const referer = request.headers.get("referer");
  if (!referer) {
    return false;
  }

  try {
    const refererUrl = new URL(referer);
    return (
      refererUrl.origin === request.nextUrl.origin &&
      PUBLIC_DEMO_PATH_PREFIXES.some((prefix) => refererUrl.pathname.startsWith(prefix))
    );
  } catch {
    return false;
  }
}

function normalizeCompetitionIds(value: DemoResetRequest["competitionId"]) {
  if (typeof value === "string") {
    return value.trim() ? [value.trim()] : [];
  }

  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [] as string[];
}

async function clearDemoCompetitions(competitionIds: string[]) {
  if (!competitionIds.length) {
    return [];
  }

  const supabase = createServiceRoleSupabaseClient();
  const { data: rows, error: loadError } = await supabase
    .from("competitions")
    .select("id")
    .in("id", competitionIds)
    .eq("is_demo", true);

  if (loadError) {
    throw new Error(loadError.message || "Unable to load demo competitions.");
  }

  const idsToDelete = (rows ?? []).map((row) => row.id as string);
  if (!idsToDelete.length) {
    return [];
  }

  const { error: deleteError } = await supabase.from("competitions").delete().in("id", idsToDelete);
  if (deleteError) {
    throw new Error(deleteError.message || "Unable to clear demo competitions.");
  }

  return idsToDelete;
}

async function handleReset(
  request: NextRequest,
  payload: DemoResetRequest | null,
  options?: { publicDemo?: boolean }
) {
  const authorized = options?.publicDemo ? true : await isAuthorizedAdminRequest(request);
  if (!authorized) {
    return NextResponse.json(
      { error: "This reset is only available from the live demo or an authorized staff session." },
      { status: 401 }
    );
  }

  try {
    const deletedCompetitionIds = await clearDemoCompetitions(normalizeCompetitionIds(payload?.competitionId));
    return NextResponse.json({
      ok: true,
      demo: {
        deletedCompetitionIds,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to reset the demo competition.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  let payload: DemoResetRequest | null = null;

  try {
    payload = (await request.json()) as DemoResetRequest;
  } catch {
    payload = null;
  }

  return handleReset(request, payload, { publicDemo: isPublicDemoResetRequest(request, payload) });
}

export async function GET(request: NextRequest) {
  return handleReset(request, null);
}
