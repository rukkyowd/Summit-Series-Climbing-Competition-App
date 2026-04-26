import { NextRequest, NextResponse } from "next/server";

const DEFAULT_SIZE = 180;
const MIN_SIZE = 120;
const MAX_SIZE = 1024;

function normalizeSize(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SIZE;
  }

  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, parsed));
}

export async function GET(request: NextRequest) {
  const data = request.nextUrl.searchParams.get("data")?.trim() ?? "";
  const size = normalizeSize(request.nextUrl.searchParams.get("size"));

  if (!data) {
    return NextResponse.json({ error: "Missing QR data." }, { status: 400 });
  }

  const upstreamUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`;
  const response = await fetch(upstreamUrl, {
    headers: {
      Accept: "image/png",
    },
    next: {
      revalidate: 3600,
    },
  });

  if (!response.ok) {
    return NextResponse.json({ error: "Unable to generate QR code." }, { status: 502 });
  }

  const imageBuffer = await response.arrayBuffer();

  return new NextResponse(imageBuffer, {
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "image/png",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
