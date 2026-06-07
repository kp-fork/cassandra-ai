"use client";

import { useEffect, useState } from "react";
import { Skull, ThumbsUp, Meh, Send } from "lucide-react";

interface Props {
  entityType: "person" | "fund" | "corp";
  entityUid: string;
  entityName: string;
}

export default function VoteWidget({ entityType, entityUid, entityName }: Props) {
  const [stats, setStats] = useState({ bad_ass: 0, good: 0, neutral: 0, total: 0, maliceScore: 0 });
  const [voting, setVoting] = useState<string | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [commentName, setCommentName] = useState("");

  useEffect(() => {
    fetch(`/api/vote?type=${entityType}&uid=${encodeURIComponent(entityUid)}`)
      .then((r) => r.json()).then(setStats).catch(() => {});
    fetch(`/api/comment?type=${entityType}&uid=${encodeURIComponent(entityUid)}`)
      .then((r) => r.json()).then((d) => setComments(d.comments || [])).catch(() => {});
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

  const handleComment = async () => {
    if (!newComment.trim()) return;
    const res = await fetch("/api/comment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType, entityUid, entityName, authorName: commentName, content: newComment }),
    });
    const data = await res.json();
    if (!data.error) {
      setComments((prev) => [data, ...prev]);
      setNewComment("");
    }
  };

  const maliceLabel =
    stats.maliceScore > 30 ? "⚠️ BAD ASS" :
    stats.maliceScore > 0 ? "의심" :
    stats.maliceScore < -30 ? "✅ Good" :
    stats.maliceScore < 0 ? "양호" :
    stats.total === 0 ? "평가 없음" : "중립";

  const maliceColor =
    stats.maliceScore > 30 ? "text-[#ff4444]" :
    stats.maliceScore > 0 ? "text-[var(--warning)]" :
    stats.maliceScore < -30 ? "text-[#44dd44]" :
    stats.maliceScore < 0 ? "text-[var(--person-color)]" :
    "text-[var(--text-muted)]";

  return (
    <div className="p-3 rounded-lg bg-[var(--bg)] border border-[var(--border)] space-y-3">
      {/* 투표 버튼 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase">집단 평가</span>
          <span className={`text-[10px] font-bold ${maliceColor}`}>{maliceLabel}</span>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => handleVote("bad_ass")}
            disabled={voting !== null}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:border-[#ff4444] hover:bg-[#ff4444]/10 transition-colors disabled:opacity-50"
            title="BAD ASS — 위험 인물/법인"
          >
            <Skull className={`w-4 h-4 ${voting === "bad_ass" ? "text-[#ff4444]" : "text-[var(--text-muted)]"}`} />
            <span className="text-xs font-bold text-[#ff4444]">{stats.bad_ass}</span>
            <span className="text-[10px] text-[var(--text-muted)]">BAD ASS</span>
          </button>
          <button
            onClick={() => handleVote("neutral")}
            disabled={voting !== null}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors disabled:opacity-50"
          >
            <Meh className={`w-4 h-4 ${voting === "neutral" ? "text-[var(--accent-glow)]" : "text-[var(--text-muted)]"}`} />
            <span className="text-xs">{stats.neutral}</span>
          </button>
          <button
            onClick={() => handleVote("good")}
            disabled={voting !== null}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:border-[#44dd44] hover:bg-[#44dd44]/10 transition-colors disabled:opacity-50"
          >
            <ThumbsUp className={`w-4 h-4 ${voting === "good" ? "text-[#44dd44]" : "text-[var(--text-muted)]"}`} />
            <span className="text-xs font-bold text-[#44dd44]">{stats.good}</span>
            <span className="text-[10px] text-[var(--text-muted)]">Good</span>
          </button>
        </div>
      </div>

      {/* 댓글 입력 */}
      <div className="border-t border-[var(--border)] pt-2">
        <div className="flex gap-1.5">
          <input
            type="text"
            placeholder="닉네임"
            value={commentName}
            onChange={(e) => setCommentName(e.target.value)}
            className="w-16 px-2 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[10px] text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] shrink-0"
          />
          <input
            type="text"
            placeholder="댓글 작성..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleComment()}
            className="flex-1 px-2 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
          />
          <button
            onClick={handleComment}
            disabled={!newComment.trim()}
            className="px-2.5 py-1.5 rounded-lg bg-[var(--accent)] text-white disabled:opacity-30 hover:opacity-90 shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 댓글 목록 */}
      {comments.length > 0 && (
        <div className="space-y-1.5 max-h-[150px] overflow-y-auto">
          {comments.map((c: any) => (
            <div key={c.id} className="text-xs">
              <span className="text-[var(--text-muted)]">{c.authorName}</span>
              <span className="ml-2">{c.content}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
