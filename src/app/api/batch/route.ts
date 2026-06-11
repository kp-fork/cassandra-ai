import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toJSON } from "@/lib/serialize";

// 배치 작업 등록
export async function POST(req: NextRequest) {
  const { targetName, targetType } = await req.json();
  if (!targetName?.trim()) return NextResponse.json({ error: "분석 대상 이름을 입력하세요" }, { status: 400 });

  const job = await prisma.batchJob.create({
    data: { targetName: targetName.trim(), targetType: targetType || "CORP" },
  });

  return NextResponse.json(toJSON(job), { status: 201 });
}

// 배치 작업 목록 + 완료된 분석 결과
export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") || "all"; // queued | done
  
  const where = type === "queued" ? { status: "QUEUED" }
    : type === "done" ? { status: "DONE" }
    : {};

  const jobs = await prisma.batchJob.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
    select: type === "done" ? {
      id: true, targetName: true, targetType: true, result: true, processedAt: true, createdAt: true,
    } : {
      id: true, targetName: true, targetType: true, status: true, createdAt: true,
    },
  });

  const queueCount = await prisma.batchJob.count({ where: { status: "QUEUED" } });

  return NextResponse.json(toJSON({ jobs, queueCount }));
}
