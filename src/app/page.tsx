"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Building2, User, Landmark, AlertTriangle, TrendingDown, ShieldAlert, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";

const EntityGraph = dynamic(() => import("@/components/EntityGraph"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[500px] flex items-center justify-center bg-[var(--surface)] rounded-xl border border-[var(--border)]">
      <Loader2 className="w-6 h-6 animate-spin text-[var(--text-muted)]" />
    </div>
  ),
});

interface SearchResult {
  corps: any[];
  persons: any[];
  funds: any[];
}

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult>({ corps: [], persons: [], funds: [] });
  const [graphData, setGraphData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"graph" | "list">("graph");

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults({ corps: [], persons: [], funds: [] });
      setGraphData(null);
      return;
    }
    setLoading(true);
    const [searchRes, graphRes] = await Promise.all([
      fetch(`/api/search?q=${encodeURIComponent(q)}`).then((r) => r.json()),
      fetch(`/api/graph?q=${encodeURIComponent(q)}`).then((r) => r.json()),
    ]);
    setResults(searchRes);
    setGraphData(graphRes);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => doSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query, doSearch]);

  // 초기 로드: 협진 검색으로 데모 데이터 표시
  useEffect(() => {
    setQuery("협진");
    doSearch("협진");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totalResults = results.corps.length + results.persons.length + results.funds.length;

  return (
    <div className="space-y-6">
      {/* 검색 바 */}
      <div className="relative max-w-2xl mx-auto">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="회사명, 인물명, 법인명으로 검색..."
          className="w-full h-14 pl-12 pr-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder-[var(--text-muted)] text-lg focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all"
        />
        {loading && (
          <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 animate-spin text-[var(--accent-glow)]" />
        )}
      </div>

      {/* 탭 전환 */}
      <div className="flex gap-2 justify-center">
        <button
          onClick={() => setActiveTab("graph")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "graph"
              ? "bg-[var(--accent)] text-white"
              : "bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]"
          }`}
        >
          관계망 그래프
        </button>
        <button
          onClick={() => setActiveTab("list")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "list"
              ? "bg-[var(--accent)] text-white"
              : "bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]"
          }`}
        >
          목록 보기 ({totalResults})
        </button>
      </div>

      {/* 그래프 뷰 */}
      {activeTab === "graph" && (
        <div className="relative rounded-xl border border-[var(--border)] overflow-hidden">
          {graphData && graphData.nodes.length > 0 ? (
            <EntityGraph data={graphData} />
          ) : (
            <div className="w-full h-[500px] flex items-center justify-center bg-[var(--surface)] text-[var(--text-muted)]">
              {query ? "검색 결과가 없습니다" : "회사명을 입력하여 관계망을 탐색하세요"}
            </div>
          )}
          {/* 범례 */}
          <div className="absolute bottom-4 left-4 flex gap-3 text-xs bg-[var(--surface)]/90 rounded-lg px-3 py-2 border border-[var(--border)]">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-[var(--corp-color)]" />
              <span>회사</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-[var(--person-color)]" />
              <span>인물</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-[var(--fund-color)]" />
              <span>법인/조합</span>
            </div>
          </div>
        </div>
      )}

      {/* 목록 뷰 */}
      {activeTab === "list" && (
        <div className="grid gap-6 md:grid-cols-3">
          {/* 회사 */}
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--accent-glow)] mb-3">
              <Building2 className="w-4 h-4" />
              회사 ({results.corps.length})
            </h3>
            <div className="space-y-2">
              {results.corps.map((c: any) => (
                <a
                  key={c.id}
                  href={`/corp/${c.corpCode}`}
                  className="block p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{c.companyName}</span>
                    <div className="flex gap-1">
                      {c.isAdmin && <ShieldAlert className="w-3.5 h-3.5 text-[var(--danger-glow)]" />}
                      {c.delistedAt && <TrendingDown className="w-3.5 h-3.5 text-[var(--danger)]" />}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-[var(--text-muted)]">
                    <span>{c.market}</span>
                    <span>{c.corpCode}</span>
                    {c._count && (
                      <span className="ml-auto">
                        공시 {c._count.filings} · 신호 {c._count.signals}
                      </span>
                    )}
                  </div>
                </a>
              ))}
              {results.corps.length === 0 && query && (
                <p className="text-xs text-[var(--text-muted)]">검색 결과 없음</p>
              )}
            </div>
          </div>

          {/* 인물 */}
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--person-color)] mb-3">
              <User className="w-4 h-4" />
              인물 ({results.persons.length})
            </h3>
            <div className="space-y-2">
              {results.persons.map((p: any) => (
                <a
                  key={p.id}
                  href={`/person/${p.personUid}`}
                  className="block p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{p.name}</span>
                    {p.flags?.includes("blacklist") && (
                      <AlertTriangle className="w-3.5 h-3.5 text-[var(--danger-glow)]" />
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-1 text-xs text-[var(--text-muted)]">
                    {p.flags?.map((f: string) => (
                      <span key={f} className="px-1.5 py-0.5 rounded bg-[var(--border)]">{f}</span>
                    ))}
                    <span className="ml-auto">
                      {p._count?.corpRelations || 0}개 회사 관련
                    </span>
                  </div>
                </a>
              ))}
              {results.persons.length === 0 && query && (
                <p className="text-xs text-[var(--text-muted)]">검색 결과 없음</p>
              )}
            </div>
          </div>

          {/* 법인/조합 */}
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--fund-color)] mb-3">
              <Landmark className="w-4 h-4" />
              법인/조합 ({results.funds.length})
            </h3>
            <div className="space-y-2">
              {results.funds.map((f: any) => (
                <a
                  key={f.id}
                  href={`/fund/${f.fundUid}`}
                  className="block p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{f.name}</span>
                    {f.flags?.includes("blacklist") && (
                      <AlertTriangle className="w-3.5 h-3.5 text-[var(--danger-glow)]" />
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-1 text-xs text-[var(--text-muted)]">
                    <span className="px-1.5 py-0.5 rounded bg-[var(--border)]">{f.fundType}</span>
                    {f.flags?.map((flag: string) => (
                      <span key={flag} className="px-1.5 py-0.5 rounded bg-[var(--border)]">{flag}</span>
                    ))}
                  </div>
                </a>
              ))}
              {results.funds.length === 0 && query && (
                <p className="text-xs text-[var(--text-muted)]">검색 결과 없음</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 알림 영역 */}
      {graphData && graphData.nodes.length > 0 && (
        <div className="p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
          <p className="text-xs text-[var(--text-muted)]">
            <strong className="text-[var(--warning)]">※ CASSANDRA AI</strong> —
            본 정보는 DART 공시 사실의 색인이며 평가나 투자 권유가 아닙니다.
            모든 데이터 포인트는 원본 공시(rcept_no)로 역추적 가능합니다.
          </p>
        </div>
      )}
    </div>
  );
}
