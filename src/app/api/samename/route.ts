import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toJSON } from "@/lib/serialize";

// 동명이인 그룹 조회
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");

  if (name) {
    const group = await prisma.sameNameGroup.findFirst({
      where: { name },
    });
    if (!group) return NextResponse.json({ persons: [], note: null });

    const persons = await prisma.person.findMany({
      where: { personUid: { in: group.personIds } },
      select: {
        personUid: true, name: true, birthDate: true, bio: true, flags: true,
        _count: { select: { corpRelations: true, fundRelations: true } },
      },
    });

    return NextResponse.json(toJSON({ persons, note: group.note, total: persons.length }));
  }

  // 모든 그룹 목록
  const groups = await prisma.sameNameGroup.findMany({
    select: { name: true, personIds: true, note: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(toJSON(groups));
}
