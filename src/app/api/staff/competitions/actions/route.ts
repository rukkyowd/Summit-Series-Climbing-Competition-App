import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server-auth";
import {
  getAdminCompetitionActionErrorStatus,
  handleAdminCompetitionAction,
  type AdminCompetitionActionRequest,
} from "@/lib/server-admin-competition-actions";

export async function POST(request: NextRequest) {
  let payload: AdminCompetitionActionRequest;

  try {
    payload = (await request.json()) as AdminCompetitionActionRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return auth.response;
    }

    const result = await handleAdminCompetitionAction(payload);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to complete admin action.";
    return NextResponse.json({ error: message }, { status: getAdminCompetitionActionErrorStatus(message) });
  }
}
