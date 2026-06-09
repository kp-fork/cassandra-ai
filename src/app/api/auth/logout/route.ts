import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
  const c = await cookies();
  c.delete("auth-token");
  return NextResponse.json({ success: true });
}
