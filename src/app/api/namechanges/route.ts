import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toJSON } from "@/lib/serialize";

export async function GET() {
  // 법인명 변경 이력이 있는 회사 목록
  const corps = await prisma.corp.findMany({
    where: {
      OR: [
        { formerNames: { isEmpty: false } },
        { corpEvents: { some: { eventType: "NAME_CHANGE" } } },
      ],
    },
    include: {
      corpEvents: {
        where: {
          eventType: {
            in: ["NAME_CHANGE", "PURPOSE_ADDITION", "DIRECTOR_CHANGE", "CAPITAL_INCREASE", "CB_ISSUANCE"],
          },
        },
        orderBy: { occurredAt: "desc" },
      },
      filings: {
        where: {
          filingType: { in: ["CB_ISSUANCE", "BW_ISSUANCE", "CAPITAL_INCREASE", "DIRECTOR_CHANGE", "PURPOSE_ADDITION"] },
        },
        orderBy: { filedAt: "desc" },
        take: 5,
      },
      signals: { take: 3 },
    },
  });

  return NextResponse.json(toJSON(corps));
}
