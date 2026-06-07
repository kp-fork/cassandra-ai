import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
  return NextResponse.json(person);
}
