import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 투표 통계 조회
export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type");
  const uid = req.nextUrl.searchParams.get("uid");

  if (type && uid) {
    const votes = await prisma.entityVote.groupBy({
      by: ["vote"],
      where: { entityType: type, entityUid: uid },
      _count: { vote: true },
    });

    const stats = { up: 0, down: 0, neutral: 0, total: 0 };
    for (const v of votes) {
      stats[v.vote as keyof typeof stats] = v._count.vote;
      stats.total += v._count.vote;
    }

    // 악의 지수: down이 up보다 많으면 음수
    const maliceScore = stats.total > 0
      ? ((stats.down - stats.up) / stats.total * 100).toFixed(0)
      : "0";

    return NextResponse.json({ ...stats, maliceScore: Number(maliceScore) });
  }

  return NextResponse.json({ up: 0, down: 0, neutral: 0, total: 0, maliceScore: 0 });
}

// 투표 제출
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { entityType, entityUid, entityName, vote } = body;

  if (!entityType || !entityUid || !vote) {
    return NextResponse.json({ error: "필수 필드 누락" }, { status: 400 });
  }
  if (!["up", "down", "neutral"].includes(vote)) {
    return NextResponse.json({ error: "vote 값은 up/down/neutral 중 하나여야 합니다" }, { status: 400 });
  }

  await prisma.entityVote.create({
    data: {
      entityType,
      entityUid,
      entityName: entityName || entityUid,
      vote,
      ip: req.headers.get("x-forwarded-for") || undefined,
    },
  });

  // 갱신된 통계 반환
  const votes = await prisma.entityVote.groupBy({
    by: ["vote"],
    where: { entityType, entityUid },
    _count: { vote: true },
  });

  const stats = { up: 0, down: 0, neutral: 0, total: 0 };
  for (const v of votes) {
    stats[v.vote as keyof typeof stats] = v._count.vote;
    stats.total += v._count.vote;
  }
  const maliceScore = stats.total > 0
    ? ((stats.down - stats.up) / stats.total * 100).toFixed(0)
    : "0";

  return NextResponse.json({ ...stats, maliceScore: Number(maliceScore) });
}
