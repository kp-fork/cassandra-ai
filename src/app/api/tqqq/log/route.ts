import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { prisma } from "@/lib/prisma";

// ─── Supabase 서버 세션에서 이메일 추출 ───
async function getSessionEmail(): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const cookieStore = await cookies();
  const supabase = createServerClient(url, key, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
  });
  const { data: { user } } = await supabase.auth.getUser();
  return user?.email ?? null;
}

// ─── 테이블 생성 + userEmail 컬럼 보장 ───
async function ensureTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "TqqqLog" (
      "id"        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "date"      TEXT NOT NULL,
      "symbol"    TEXT NOT NULL,
      "shares"    DOUBLE PRECISION NOT NULL,
      "priceUsd"  DOUBLE PRECISION NOT NULL,
      "krwAmount" DOUBLE PRECISION,
      "usdKrw"    DOUBLE PRECISION,
      "note"      TEXT,
      "userEmail" TEXT,
      "createdAt" TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // 기존 테이블에 userEmail 컬럼이 없을 경우 추가 (멱등)
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "TqqqLog" ADD COLUMN IF NOT EXISTS "userEmail" TEXT
  `);
}

export async function GET() {
  const email = await getSessionEmail();
  if (!email) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  try {
    await ensureTable();
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "TqqqLog" WHERE "userEmail" = $1 ORDER BY "date" DESC, "createdAt" DESC`,
      email,
    );
    return NextResponse.json({ logs: rows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const email = await getSessionEmail();
  if (!email) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  try {
    await ensureTable();
    const body = await req.json();
    const { date, symbol, shares, priceUsd, krwAmount, usdKrw, note } = body;
    if (!date || !symbol || !shares || !priceUsd) {
      return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 });
    }
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO "TqqqLog" ("date","symbol","shares","priceUsd","krwAmount","usdKrw","note","userEmail")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      date, symbol, Number(shares), Number(priceUsd),
      krwAmount ? Number(krwAmount) : null,
      usdKrw    ? Number(usdKrw)   : null,
      note || null,
      email,
    );
    return NextResponse.json({ log: rows[0] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const email = await getSessionEmail();
  if (!email) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  try {
    const { id } = await req.json();
    // 본인 로그만 삭제 가능
    await prisma.$executeRawUnsafe(
      `DELETE FROM "TqqqLog" WHERE id=$1 AND "userEmail"=$2`,
      id, email,
    );
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
