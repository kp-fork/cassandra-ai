import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const { uid } = await params;
  const fund = await prisma.fund.findUnique({
    where: { fundUid: uid },
    include: {
      corpRelations: { include: { corp: true } },
      personRelations: { include: { person: true } },
    },
  });
  if (!fund) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(fund);
}
