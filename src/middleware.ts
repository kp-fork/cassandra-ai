import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const token = request.cookies.get("auth-token")?.value;

  // 공개 경로: /login, /api/auth, 정적 파일
  if (path.startsWith("/api/") || path.startsWith("/_next") || path.startsWith("/favicon") || path.startsWith("/images")) {
    return NextResponse.next();
  }

  // 로그인 상태면 /login → /dashboard 로 리다이렉트
  if (token && path === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // 비로그인 → /login 으로
  if (!token && path !== "/login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"],
};
