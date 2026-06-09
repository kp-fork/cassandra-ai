import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createToken } from "@/lib/auth";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: "이메일과 비밀번호를 입력하세요" }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.appUser.findUnique({ where: { email: normalizedEmail } });

  const logData = {
    email: normalizedEmail,
    ip: req.headers.get("x-forwarded-for") || undefined,
    userAgent: req.headers.get("user-agent") || undefined,
    success: false,
    userId: user?.id || "unknown",
  };

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    await prisma.loginHistory.create({ data: logData });
    return NextResponse.json({ error: "이메일 또는 비밀번호가 일치하지 않습니다" }, { status: 401 });
  }

  // 중복 로그인 체크
  const recentLogin = await prisma.loginHistory.findFirst({
    where: {
      userId: user.id,
      success: true,
      createdAt: { gte: new Date(Date.now() - 3 * 60 * 60 * 1000) },
    },
  });

  await prisma.loginHistory.create({ data: { ...logData, success: true } });
  await prisma.appUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const token = createToken(user.id, user.email);
  const c = await cookies();
  c.set("auth-token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 3 * 60 * 60,
    path: "/",
  });

  // 세션 플래그 쿠키 (JS에서 읽기 가능)
  c.set("session", "1", {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 3 * 60 * 60,
    path: "/",
  });

  return NextResponse.json({
    success: true,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    duplicateLogin: !!recentLogin,
  });
}
