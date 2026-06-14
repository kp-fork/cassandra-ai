"use client";

import { useEffect, useState } from "react";
import { Shield, Users, Eye, TrendingUp, Clock } from "lucide-react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

const ADMIN_EMAILS = ["gameworker@gmail.com"];

export default function AdminPage() {
    const [authorized, setAuthorized] = useState(false);
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const supabase = createSupabaseBrowser();
        supabase.auth.getSession().then(({ data: { session } }) => {
            const email = session?.user?.email;
            if (email && ADMIN_EMAILS.includes(email)) {
                setAuthorized(true);
                fetchStats();
            } else {
                setAuthorized(false);
                setLoading(false);
            }
        });
    }, []);

    const fetchStats = async () => {
        try {
            const res = await fetch("/api/admin/stats");
            const data = await res.json();
            setStats(data);
        } catch {}
        setLoading(false);
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center text-[var(--text-muted)]">로딩 중...</div>;
    if (!authorized) return <div className="min-h-screen flex items-center justify-center text-[#ef4444]">관리자 권한이 없습니다.</div>;

    return (
        <div className="max-w-4xl mx-auto py-6 px-4 space-y-6">
            <div className="flex items-center gap-3">
                <Shield className="w-6 h-6 text-[#f59e0b]" />
                <h1 className="text-xl font-bold">관리자 대시보드</h1>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard icon={<Users />} label="총 가입자" value={stats?.totalUsers ?? "-"} color="#3b82f6" />
                <StatCard icon={<Eye />} label="오늘 로그인" value={stats?.todayLogins ?? "-"} color="#22c55e" />
                <StatCard icon={<TrendingUp />} label="오늘 방문" value={stats?.todayPageviews ?? "-"} color="#f59e0b" />
                <StatCard icon={<Clock />} label="최근 가입" value={stats?.recentSignups ?? "-"} color="#a855f7" />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl bg-[var(--surface)] border border-[var(--border)] p-4">
                    <h2 className="text-sm font-bold mb-3">페이지 방문 Top 5</h2>
                    {stats?.topPages?.map((p: any, i: number) => (
                        <div key={i} className="flex justify-between text-xs py-1 border-b border-[var(--border)] last:border-0">
                            <span className="text-[var(--text-muted)]">{p.path}</span>
                            <span className="font-semibold">{p.count}건</span>
                        </div>
                    ))}
                </div>
                <div className="rounded-xl bg-[var(--surface)] border border-[var(--border)] p-4">
                    <h2 className="text-sm font-bold mb-3">Supabase 사용자</h2>
                    {stats?.supabaseUsers?.map((u: any, i: number) => (
                        <div key={i} className="flex justify-between text-xs py-1 border-b border-[var(--border)] last:border-0">
                            <span className="text-[var(--text-muted)]">{u.email}</span>
                            <span className="text-[10px]">{new Date(u.created_at).toLocaleDateString("ko-KR")}</span>
                        </div>
                    )) || <p className="text-[10px] text-[var(--text-muted)]">데이터 없음</p>}
                </div>
            </div>
        </div>
    );
}

function StatCard({ icon, label, value, color }: any) {
    return (
        <div className="rounded-xl bg-[var(--surface)] border border-[var(--border)] p-4 text-center">
            <div className="w-8 h-8 mx-auto rounded-full flex items-center justify-center" style={{ backgroundColor: color + "20", color }}>
                {icon}
            </div>
            <div className="text-2xl font-bold mt-2">{value}</div>
            <div className="text-[10px] text-[var(--text-muted)]">{label}</div>
        </div>
    );
}
