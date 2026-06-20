import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const ADMIN_EMAILS = ["gameworker@gmail.com"];

// POST: 초대 이메일 등록
export async function POST(req: NextRequest) {
  const { email, adminEmail } = await req.json();
  if (!adminEmail || !ADMIN_EMAILS.includes(adminEmail)) {
    return NextResponse.json({ error: "관리자 권한 필요" }, { status: 403 });
  }
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "유효한 이메일이 필요합니다" }, { status: 400 });
  }

  await prisma.appUser.upsert({
    where: { email },
    update: { tier: "expert" },
    create: {
      email,
      passwordHash: "",
      name: email.split("@")[0],
      role: "user",
      tier: "expert",
    },
  });

  const link = `https://dart-monitor-pi.vercel.app/invite?email=${encodeURIComponent(email)}`;
  return NextResponse.json({ ok: true, link });
}

// GET: 이메일 사전 승인 여부 확인 (invite 페이지에서 호출)
export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ approved: false });
  const user = await prisma.appUser.findUnique({ where: { email }, select: { tier: true } });
  return NextResponse.json({ approved: user?.tier === "expert" });
}
