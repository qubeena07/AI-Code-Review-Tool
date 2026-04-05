import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export async function GET(req: NextRequest) {
  const cookie = req.headers.get("cookie") ?? "";
  const search = req.nextUrl.searchParams.toString();
  const res = await fetch(`${API_URL}/reviews/export${search ? `?${search}` : ""}`, {
    headers: { cookie },
  });
  const csv = await res.text();
  return new NextResponse(csv, {
    status: res.status,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="reviews.csv"',
    },
  });
}
