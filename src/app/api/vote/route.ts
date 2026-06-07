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

    const stats: Record<string, number> = { bad_ass: 0, good: 0, neutral: 0, total: 0 };
    for (const v of votes) {
      if (v.vote in stats) stats[v.vote] = v._count.vote;
      stats.total += v._count.vote;
    }

    // 악의 지수: bad_ass이 good보다 많으면 +
    const maliceScore = stats.total > 0
      ? ((stats.bad_ass - stats.good) / stats.total * 100).toFixed(0)
      : "0";

    return NextResponse.json({ ...stats, maliceScore: Number(maliceScore) });
  }

  return NextResponse.json({ bad_ass: 0, good: 0, neutral: 0, total: 0, maliceScore: 0 });
}

// 투표 제출
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { entityType, entityUid, entityName, vote } = body;

  if (!entityType || !entityUid || !vote) {
    return NextResponse.json({ error: "필수 필드 누락" }, { status: 400 });
  }
  if (!["bad_ass", "good", "neutral"].includes(vote)) {
    return NextResponse.json({ error: "vote 값이 올바르지 않습니다" }, { status: 400 });
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

  const stats: Record<string, number> = { bad_ass: 0, good: 0, neutral: 0, total: 0 };
  for (const v of votes) {
    if (v.vote in stats) stats[v.vote] = v._count.vote;
    stats.total += v._count.vote;
  }
  const maliceScore = stats.total > 0
    ? ((stats.bad_ass - stats.good) / stats.total * 100).toFixed(0)
    : "0";

  return NextResponse.json({ ...stats, maliceScore: Number(maliceScore) });
}
