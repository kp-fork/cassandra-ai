import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toJSON } from "@/lib/serialize";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const { uid } = await params;
  const person = await prisma.person.findUnique({
    where: { personUid: uid },
    include: {
      corpRelations: { include: { corp: true } },
      fundRelations: { include: { fund: true } },
    },
  });
  if (!person) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sameNameGroup = await prisma.sameNameGroup.findFirst({ where: { name: person.name } });
  const sameNameCount = sameNameGroup ? sameNameGroup.personIds.length : 1;

  return NextResponse.json(toJSON({ ...person, sameNameCount }));
}
