"use client";

import { useEffect, useState } from "react";
import { ThumbsUp, ThumbsDown, Meh } from "lucide-react";

interface Props {
  entityType: "person" | "fund" | "corp";
  entityUid: string;
  entityName: string;
}

export default function VoteWidget({ entityType, entityUid, entityName }: Props) {
  const [stats, setStats] = useState({ up: 0, down: 0, neutral: 0, total: 0, maliceScore: 0 });
  const [voting, setVoting] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/vote?type=${entityType}&uid=${encodeURIComponent(entityUid)}`)
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, [entityType, entityUid]);

  const handleVote = async (vote: string) => {
    setVoting(vote);
    const res = await fetch("/api/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType, entityUid, entityName, vote }),
    });
    const data = await res.json();
    if (!data.error) setStats(data);
    setVoting(null);
  };

  const maliceLabel =
    stats.maliceScore > 30 ? "⚠️ 부정적 평가 우세" :
    stats.maliceScore > 0 ? "약간 부정적" :
    stats.maliceScore < -30 ? "✅ 긍정적 평가 우세" :
    stats.maliceScore < 0 ? "약간 긍정적" :
    stats.total === 0 ? "아직 평가 없음" : "중립적";

  const maliceColor =
    stats.maliceScore > 30 ? "text-[var(--danger-glow)]" :
    stats.maliceScore > 0 ? "text-[var(--warning)]" :
    stats.maliceScore < -30 ? "text-[var(--person-color)]" :
    stats.maliceScore < 0 ? "text-[var(--accent-glow)]" :
    "text-[var(--text-muted)]";

  return (
    <div className="p-3 rounded-lg bg-[var(--bg)] border border-[var(--border)]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase">집단 평가</span>
        <span className={`text-[10px] font-medium ${maliceColor}`}>
          {maliceLabel}
          {stats.total > 0 && ` (${stats.maliceScore > 0 ? "+" : ""}${stats.maliceScore})`}
        </span>
      </div>
      <div className="flex gap-1.5">
        <button
          onClick={() => handleVote("up")}
          disabled={voting !== null}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--person-color)] hover:bg-[var(--person-color)]/10 transition-colors disabled:opacity-50"
        >
          <ThumbsUp className={`w-3.5 h-3.5 ${voting === "up" ? "text-[var(--person-color)]" : "text-[var(--text-muted)]"}`} />
          <span className="text-xs">{stats.up}</span>
        </button>
        <button
          onClick={() => handleVote("neutral")}
          disabled={voting !== null}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors disabled:opacity-50"
        >
          <Meh className={`w-3.5 h-3.5 ${voting === "neutral" ? "text-[var(--accent-glow)]" : "text-[var(--text-muted)]"}`} />
          <span className="text-xs">{stats.neutral}</span>
        </button>
        <button
          onClick={() => handleVote("down")}
          disabled={voting !== null}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--danger)] hover:bg-[var(--danger)]/10 transition-colors disabled:opacity-50"
        >
          <ThumbsDown className={`w-3.5 h-3.5 ${voting === "down" ? "text-[var(--danger-glow)]" : "text-[var(--text-muted)]"}`} />
          <span className="text-xs">{stats.down}</span>
        </button>
      </div>
      <p className="text-[9px] text-[var(--text-muted)] mt-1.5 text-center">
        투표는 집단 지성 기반 참고용입니다
      </p>
    </div>
  );
}
