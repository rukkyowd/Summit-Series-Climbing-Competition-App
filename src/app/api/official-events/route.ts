import { NextResponse } from "next/server";
import { fetchOfficialBoulderingEvents } from "@/lib/official-events";

export async function GET() {
  try {
    const events = await fetchOfficialBoulderingEvents();
    return NextResponse.json({ events });
  } catch (error) {
    return NextResponse.json(
      {
        events: [],
        error: error instanceof Error ? error.message : "Unable to load official events.",
      },
      { status: 500 }
    );
  }
}
