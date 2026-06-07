import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toJSON } from "@/lib/serialize";

// 댓글 목록
export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type");
  const uid = req.nextUrl.searchParams.get("uid");
  if (!type || !uid) return NextResponse.json({ comments: [] });

  const comments = await prisma.entityComment.findMany({
    where: { entityType: type, entityUid: uid },
    orderBy: { createdAt: "desc" },
    select: { id: true, authorName: true, content: true, createdAt: true },
    take: 50,
  });

  return NextResponse.json(toJSON({ comments }));
}

// 댓글 작성
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { entityType, entityUid, entityName, authorName, content } = body;

  if (!entityType || !entityUid || !content?.trim()) {
    return NextResponse.json({ error: "필수 필드 누락" }, { status: 400 });
  }

  const comment = await prisma.entityComment.create({
    data: {
      entityType,
      entityUid,
      entityName: entityName || entityUid,
      authorName: authorName?.trim() || "익명",
      content: content.trim(),
      ip: req.headers.get("x-forwarded-for") || undefined,
    },
  });

  return NextResponse.json(toJSON(comment), { status: 201 });
}
