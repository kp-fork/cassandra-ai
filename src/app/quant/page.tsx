"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus, Share2, Copy, Users, Eye, ExternalLink, AlertTriangle, BarChart3, Activity } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// ─── 더미 차트 데이터 (Naver Finance 연동 전) ───
const gaugeData = [
  { name: "공포", value: 35, color: "#ef4444" },
  { name: "중립", value: 40, color: "#f59e0b" },
  { name: "과열", value: 25, color: "#22c55e" },
];

const regimeData = [
  { date: "06/01", regime: 2, label: "상승" },
  { date: "06/02", regime: 2, label: "상승" },
  { date: "06/03", regime: 1, label: "횡보" },
  { date: "06/04", regime: 1, label: "횡보" },
  { date: "06/05", regime: 2, label: "상승" },
  { date: "06/06", regime: 2, label: "상승" },
  { date: "06/07", regime: 3, label: "급등" },
  { date: "06/08", regime: 2, label: "상승" },
  { date: "06/09", regime: 1, label: "횡보" },
  { date: "06/10", regime: 0, label: "하락" },
  { date: "06/11", regime: 2, label: "상승" },
];

const momentumData = [
  { date: "06/01", amqs: 100, m7: 102 },
  { date: "06/03", amqs: 103, m7: 105 },
  { date: "06/05", amqs: 107, m7: 110 },
  { date: "06/07", amqs: 112, m7: 118 },
  { date: "06/09", amqs: 108, m7: 114 },
  { date: "06/11", amqs: 115, m7: 122 },
];

export default function QuantDashboard() {
  const [visitors, setVisitors] = useState({ today: 0, total: 0 });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/pageview").then(r => r.json()).then(d => {
      setVisitors({ today: d.today || 0, total: d.total || 0 });
    }).catch(() => {});
  }, []);

  const shareText = `📊 CASSANDRA AI — 코스닥 주가 영향 검토 시그널\n\nAI와 퀀트로 분석하는 코스닥 이상 징후 대시보드\n무료로 이용하세요!\n\nhttps://dart-monitor-pi.vercel.app/quant`;
  const handleCopy = () => { navigator.clipboard.writeText(shareText); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="text-center">
        <h1 className="text-2xl font-bold">Awesome LLM Quant Scripts Dashboard</h1>
        <p className="text-xs text-[var(--text-muted)] mt-1">AI × 퀀트 × DART 공시 기반 코스닥 시장 분석</p>
      </div>

      {/* 방문자 수 */}
      <div className="flex justify-center gap-4 text-xs text-[var(--text-muted)]">
        <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> 오늘 {visitors.today}명</span>
        <span className="flex items-center gap-1"><Users className="w-3 h-3" /> 누적 {visitors.total}명</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 1. 시장 게이지 */}
        <div className="rounded-xl bg-[var(--surface)] border border-[var(--border)] p-4">
          <h2 className="text-sm font-bold flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-[var(--warning)]" /> 시장 게이지
          </h2>
          <div className="flex items-center gap-0 h-8 rounded-full overflow-hidden">
            {gaugeData.map((g) => (
              <div key={g.name} className="h-full flex items-center justify-center text-[10px] font-bold text-white transition-all" style={{ width: `${g.value}%`, backgroundColor: g.color }}>
                {g.value > 20 ? g.name : ""}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-[var(--text-muted)]">
            <span>🔴 공포</span><span>🟡 중립</span><span>🟢 과열</span>
          </div>
          <p className="text-[10px] text-[var(--text-muted)] mt-2">※ Toss Securities API 활성화 시 Naver Finance로 교체 예정</p>
        </div>

        {/* 2. 시장 국면 판단 (ARDS-X) */}
        <div className="rounded-xl bg-[var(--surface)] border border-[var(--border)] p-4">
          <h2 className="text-sm font-bold flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-[var(--accent-glow)]" /> 시장 국면 판단 (ARDS-X)
          </h2>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={regimeData}>
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#888" }} />
              <YAxis domain={[0, 4]} tick={{ fontSize: 9, fill: "#888" }} />
              <Tooltip />
              <Line type="monotone" dataKey="regime" stroke="#6c5ce7" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex justify-between mt-1 text-[10px]">
            <span className="text-[#ef4444]">0: 하락</span>
            <span className="text-[var(--text-muted)]">1: 횡보</span>
            <span className="text-[var(--accent-glow)]">2: 상승</span>
            <span className="text-[#22c55e]">3: 급등</span>
          </div>
        </div>

        {/* 3. AI 반도체 모멘텀 (AMQS) */}
        <div className="rounded-xl bg-[var(--surface)] border border-[var(--border)] p-4">
          <h2 className="text-sm font-bold flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-[#22c55e]" /> AI 반도체 모멘텀 (AMQS / AMQS-M7)
          </h2>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={momentumData}>
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#888" }} />
              <YAxis domain={[95, 130]} tick={{ fontSize: 9, fill: "#888" }} />
              <Tooltip />
              <Line type="monotone" dataKey="amqs" stroke="#6c5ce7" strokeWidth={2} dot={false} name="AMQS" />
              <Line type="monotone" dataKey="m7" stroke="#22c55e" strokeWidth={2} dot={false} name="M7" />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-1 text-[10px]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#6c5ce7]" /> AMQS</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#22c55e]" /> AMQS-M7</span>
          </div>
        </div>

        {/* 4. 방어 헤지 (ARDS) */}
        <div className="rounded-xl bg-[var(--surface)] border border-[var(--border)] p-4">
          <h2 className="text-sm font-bold flex items-center gap-2 mb-3">
            <TrendingDown className="w-4 h-4 text-[#ef4444]" /> 방어·헤지 (ARDS)
          </h2>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded bg-[var(--bg)] text-center">
              <div className="text-[var(--text-muted)]">AMQS-M7 비중</div>
              <div className="font-bold text-lg">65%</div>
            </div>
            <div className="p-2 rounded bg-[var(--bg)] text-center">
              <div className="text-[var(--text-muted)]">헤지 비중</div>
              <div className="font-bold text-lg">35%</div>
            </div>
            <div className="p-2 rounded bg-[var(--bg)] text-center col-span-2">
              <div className="text-[var(--text-muted)]">Median + 15% Cap</div>
              <div className="font-bold">대칭 헤지 적용 중</div>
            </div>
          </div>
          <p className="text-[10px] text-[var(--text-muted)] mt-2">
            매수: 상승 국면 · 매도: 하락 국면 · 중립: 횡보
          </p>
        </div>
      </div>

      {/* 친구 추천 */}
      <div className="rounded-xl bg-[var(--surface)] border border-[var(--border)] p-4 text-center">
        <h3 className="text-sm font-bold flex items-center justify-center gap-2 mb-2">
          <Share2 className="w-4 h-4" /> 친구에게 추천하기
        </h3>
        <p className="text-xs text-[var(--text-muted)] mb-3">아래 메시지를 복사해서 공유하세요</p>
        <div className="bg-[var(--bg)] rounded-lg p-3 text-xs text-left font-mono whitespace-pre-wrap mb-2">
          {shareText}
        </div>
        <button onClick={handleCopy} className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-xs font-medium">
          {copied ? "✅ 복사 완료!" : <span className="flex items-center gap-1"><Copy className="w-3 h-3" /> 메시지 복사</span>}
        </button>
      </div>

      {/* CASSANDRA AI 링크 */}
      <div className="rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/20 p-4 text-center">
        <h3 className="text-lg font-bold text-[var(--accent-glow)]">CASSANDRA AI</h3>
        <p className="text-xs text-[var(--text-muted)] mt-1">DART 공시 기반 관계망 분석 · 인물 검색 · 이상 징후 탐지</p>
        <a href="/" className="inline-block mt-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-xs font-medium">
          로그인하고 분석 시작하기
        </a>
      </div>

      {/* 위험 고지 */}
      <div className="p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] space-y-2 text-[10px] text-[var(--text-muted)]">
        <p className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-[var(--warning)]" /> <strong className="text-[var(--warning)]">위험 고지</strong></p>
        <p>본 대시보드는 AI와 퀀트 모델을 활용한 시장 분석 도구입니다. 특정 종목의 매수·매도를 권유하지 않으며, 모든 투자 결정은 이용자 본인의 판단과 책임하에 이루어져야 합니다. 퀀트 지표는 과거 데이터 기반이므로 미래 수익을 보장하지 않습니다.</p>
      </div>

      {/* GitHub 홍보 */}
      <div className="text-center text-xs text-[var(--text-muted)] space-y-1">
        <a href="https://github.com/gameworkerkim/vibe-investing" target="_blank" className="text-[var(--accent-glow)] hover:underline flex items-center justify-center gap-1">
          <ExternalLink className="w-3 h-3" /> github.com/gameworkerkim/vibe-investing
        </a>
        <p>AI × 퀀트 × DART 공시 기반 코스닥 시장 분석 오픈소스</p>
      </div>
    </div>
  );
}
