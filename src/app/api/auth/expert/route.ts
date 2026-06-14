/**
 * Expert 인증 API — 신청·관리자승인·OTP인증·재인증
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isExpertDomain, getDomainCategory, checkExpertStatus, sendExpertReverifyOtp, completeReverify } from "@/lib/expert";

export async function POST(req: NextRequest) {
    const { action, email, adminEmail } = await req.json();

    // ─── 도메인 검증 ───
    if (action === "verify-domain") {
        if (!email) return NextResponse.json({ error: "이메일이 필요합니다" }, { status: 400 });
        const allowed = isExpertDomain(email);
        const category = getDomainCategory(email);
        return NextResponse.json({ allowed, category, domain: email.split("@")[1], message: allowed ? `${category === "media" ? "언론사" : "공공기관"} 이메일로 확인되었습니다. 관리자 승인 후 이용 가능합니다.` : "허용된 기관 이메일이 아닙니다." });
    }

    // ─── Expert 신청 (pending 상태) ───
    if (action === "apply") {
        if (!email) return NextResponse.json({ error: "이메일이 필요합니다" }, { status: 400 });
        if (!isExpertDomain(email)) return NextResponse.json({ error: "허용된 기관 이메일이 아닙니다." }, { status: 400 });

        const category = getDomainCategory(email);
        await prisma.appUser.upsert({
            where: { email },
            update: { tier: "normal", expertCategory: category },
            create: { email, passwordHash: "", name: email.split("@")[0], role: "user", tier: "normal", expertCategory: category },
        });

        return NextResponse.json({ ok: true, message: "Expert 신청이 접수되었습니다. 관리자 승인 후 이메일 인증을 진행해주세요.", status: "pending" });
    }

    // ─── 관리자 승인 ───
    if (action === "approve") {
        const ADMIN_EMAILS = ["gameworker@gmail.com"];
        if (!adminEmail || !ADMIN_EMAILS.includes(adminEmail)) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
        if (!email) return NextResponse.json({ error: "이메일이 필요합니다" }, { status: 400 });

        await prisma.appUser.updateMany({ where: { email }, data: { tier: "expert" } });

        // Supabase OTP 발송
        const otpResult = await sendExpertReverifyOtp(email);
        return NextResponse.json({ ok: true, message: "승인 완료. 인증 이메일이 발송되었습니다.", otpSent: otpResult.ok });
    }

    // ─── 관리자 거절 ───
    if (action === "reject") {
        const ADMIN_EMAILS = ["gameworker@gmail.com"];
        if (!adminEmail || !ADMIN_EMAILS.includes(adminEmail)) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
        if (!email) return NextResponse.json({ error: "이메일이 필요합니다" }, { status: 400 });

        await prisma.appUser.updateMany({ where: { email }, data: { tier: "normal", expertCategory: null } });
        return NextResponse.json({ ok: true, message: "거절되었습니다." });
    }

    // ─── 이메일 OTP 인증 완료 ───
    if (action === "verify-otp") {
        if (!email) return NextResponse.json({ error: "이메일이 필요합니다" }, { status: 400 });
        await prisma.appUser.updateMany({ where: { email }, data: { expertVerifiedAt: new Date() } });
        return NextResponse.json({ ok: true, message: "이메일 인증 완료! Expert 기능을 이용할 수 있습니다.", verified: true });
    }

    // ─── 상태 확인 ───
    if (action === "status") {
        if (!email) return NextResponse.json({ error: "이메일이 필요합니다" }, { status: 400 });
        const user = await prisma.appUser.findFirst({ where: { email }, select: { tier: true, expertCategory: true, expertVerifiedAt: true } });
        if (!user) return NextResponse.json({ tier: "normal", status: "none" });

        const needsVerify = user.tier === "expert" && !user.expertVerifiedAt;
        const status = user.tier === "expert" ? (needsVerify ? "approved_unverified" : "verified") : user.expertCategory ? "pending" : "none";
        return NextResponse.json({ tier: user.tier, category: user.expertCategory, needsVerify, status });
    }

    // ─── 재인증 OTP 발송 ───
    if (action === "reverify-send") {
        if (!email) return NextResponse.json({ error: "이메일이 필요합니다" }, { status: 400 });
        const result = await sendExpertReverifyOtp(email);
        return NextResponse.json(result);
    }

    // ─── 재인증 완료 ───
    if (action === "reverify-complete") {
        if (!email) return NextResponse.json({ error: "이메일이 필요합니다" }, { status: 400 });
        await completeReverify(email);
        return NextResponse.json({ ok: true, message: "재인증 완료. 6개월간 유효합니다." });
    }

    // ─── 신청 목록 (관리자) ───
    if (action === "list") {
        const ADMIN_EMAILS = ["gameworker@gmail.com"];
        if (!adminEmail || !ADMIN_EMAILS.includes(adminEmail)) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
        const apps = await prisma.appUser.findMany({ where: { expertCategory: { not: null } }, select: { email: true, tier: true, expertCategory: true, expertVerifiedAt: true }, orderBy: { createdAt: "desc" }, take: 50 });
        return NextResponse.json({ applications: apps.map(a => ({ email: a.email, tier: a.tier, category: a.expertCategory, verifiedAt: a.expertVerifiedAt?.toISOString() || null, status: a.tier === "expert" ? (a.expertVerifiedAt ? "verified" : "approved_unverified") : "pending" })) });
    }

    return NextResponse.json({ error: "알 수 없는 action" }, { status: 400 });
}
