import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export async function GET(req: NextRequest) {
  const cookie = req.headers.get("cookie") ?? "";
  const res = await fetch(`${API_URL}/analytics`, { headers: { cookie } });
  const body = await res.json();
  return NextResponse.json(body, { status: res.status });
}
