"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Shield, Mail, CheckCircle2, AlertCircle, Loader2, ArrowRight, Clock } from "lucide-react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

function ExpertApplyForm() {
    const [email, setEmail] = useState("");
    const [step, setStep] = useState<"input" | "verify" | "pending" | "approved" | "done">("input");
    const [domainResult, setDomainResult] = useState<any>(null);
    const [status, setStatus] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        const supabase = createSupabaseBrowser();
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user?.email) {
                setEmail(session.user.email);
                checkStatus(session.user.email);
            }
        });
    }, []);

    const checkStatus = async (e: string) => {
        const res = await fetch("/api/auth/expert", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", email: e }) });
        const data = await res.json();
        setStatus(data);
        if (data.status === "none" || data.status === "pending") setStep("verify");
        else if (data.status === "approved_unverified") setStep("approved");
        else if (data.status === "verified") setStep("done");
    };

    const verifyDomain = async () => {
        setLoading(true); setError("");
        const res = await fetch("/api/auth/expert", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify-domain", email }) });
        const data = await res.json();
        setDomainResult(data);
        setLoading(false);
    };

    const applyExpert = async () => {
        setLoading(true); setError("");
        const res = await fetch("/api/auth/expert", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "apply", email }) });
        const data = await res.json();
        setLoading(false);
        if (data.error) { setError(data.error); return; }
        setStep("pending");
    };

    const verifyOtp = async () => {
        setLoading(true); setError("");
        // Supabase OTP 확인은 이미 로그인 세션에 반영됨
        const res = await fetch("/api/auth/expert", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify-otp", email }) });
        const data = await res.json();
        setLoading(false);
        if (data.error) { setError(data.error); return; }
        setStep("done");
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4">
            <div className="w-full max-w-sm space-y-6">
                <div className="text-center">
                    <Shield className="w-10 h-10 mx-auto text-[#f59e0b]" />
                    <h1 className="text-lg font-bold mt-3">Expert 인증</h1>
                    <p className="text-xs text-[var(--text-muted)] mt-1">언론·공공기관 관계자 전용</p>
                </div>

                <div className="rounded-xl bg-[var(--surface)] border border-[var(--border)] p-5 space-y-4">
                    {step === "input" && (
                        <div className="text-center space-y-3">
                            <p className="text-xs text-[var(--text-muted)]">Google 로그인 후 Expert 이메일을 인증해주세요.</p>
                            <a href="/login" className="block w-full py-2.5 rounded-lg bg-[var(--accent)] text-white text-sm font-medium text-center">로그인하기</a>
                        </div>
                    )}

                    {(step === "verify" || step === "pending" || step === "approved" || step === "done") && (
                        <>
                            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]"><Mail className="w-3 h-3" /> {email}</div>
                        </>
                    )}

                    {step === "verify" && !domainResult && (
                        <button onClick={verifyDomain} disabled={loading} className="w-full py-2.5 rounded-lg bg-[var(--accent)] text-white text-sm font-medium disabled:opacity-50">
                            {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "이메일 도메인 검증"}
                        </button>
                    )}

                    {step === "verify" && domainResult?.allowed && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-[#22c55e] text-xs bg-[#22c55e]/10 rounded p-2">
                                <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> {domainResult.message}
                            </div>
                            <button onClick={applyExpert} disabled={loading} className="w-full py-2.5 rounded-lg bg-[#f59e0b] text-black text-sm font-medium disabled:opacity-50">
                                {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : <span className="flex items-center justify-center gap-2">Expert 신청 <ArrowRight className="w-3 h-3" /></span>}
                            </button>
                        </div>
                    )}

                    {step === "verify" && domainResult && !domainResult.allowed && (
                        <div className="flex items-start gap-2 text-[#ef4444] text-xs bg-[#ef4444]/10 rounded p-2">
                            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <div><p className="font-semibold">인증 불가</p><p>{domainResult.message}</p></div>
                        </div>
                    )}

                    {step === "pending" && (
                        <div className="space-y-3 text-center">
                            <Clock className="w-10 h-10 mx-auto text-[#f59e0b]" />
                            <p className="text-sm font-semibold">관리자 승인 대기 중</p>
                            <p className="text-xs text-[var(--text-muted)]">Expert 신청이 접수되었습니다.<br />관리자 승인까지 1-2일 소요됩니다.</p>
                            <button onClick={() => checkStatus(email)} className="text-[10px] text-[var(--accent-glow)] hover:underline">상태 새로고침</button>
                        </div>
                    )}

                    {step === "approved" && (
                        <div className="space-y-3 text-center">
                            <CheckCircle2 className="w-10 h-10 mx-auto text-[#22c55e]" />
                            <p className="text-sm font-semibold">관리자 승인 완료!</p>
                            <p className="text-xs text-[var(--text-muted)]">이메일 인증을 완료해주세요.<br />인증 메일이 발송되었습니다.</p>
                            <button onClick={verifyOtp} disabled={loading} className="w-full py-2.5 rounded-lg bg-[var(--accent)] text-white text-sm font-medium disabled:opacity-50">
                                {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "이메일 인증 완료"}
                            </button>
                        </div>
                    )}

                    {step === "done" && (
                        <div className="space-y-3 text-center">
                            <CheckCircle2 className="w-10 h-10 mx-auto text-[#22c55e]" />
                            <p className="text-sm font-semibold">Expert 인증 완료!</p>
                            <p className="text-xs text-[var(--text-muted)]">모든 기능을 이용할 수 있습니다. 6개월 후 재인증 필요.</p>
                            <a href="/" className="block py-2 rounded-lg bg-[var(--accent)]/10 text-[var(--accent-glow)] text-sm">관계망 분석 시작하기</a>
                        </div>
                    )}

                    {error && <div className="flex items-center gap-2 text-[#ef4444] text-xs bg-[#ef4444]/10 rounded p-2"><AlertCircle className="w-3 h-3 flex-shrink-0" /> {error}</div>}
                </div>

                <div className="text-center text-[10px] text-[var(--text-muted)] leading-relaxed">
                    <p>언론사·공공기관 이메일 → 도메인 검증 → 관리자 승인 → 이메일 인증</p>
                    <p>6개월마다 재인증 필요</p>
                </div>
            </div>
        </div>
    );
}

export default function ExpertApplyPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-[var(--accent-glow)]" /></div>}>
            <ExpertApplyForm />
        </Suspense>
    );
}
