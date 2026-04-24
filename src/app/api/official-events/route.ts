import { NextResponse } from "next/server";
import { fetchOfficialBoulderingEvents } from "@/lib/official-events";

export async function GET() {
  try {
    const events = await fetchOfficialBoulderingEvents();
    return NextResponse.json({ events });
  } catch (error) {
    console.error("Unable to load official events.", error);
    return NextResponse.json(
      {
        events: [],
        error: "Unable to load official events.",
      },
      { status: 500 }
    );
  }
}
