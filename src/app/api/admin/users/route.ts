import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // auth.users 직접 조회 (Supabase가 관리하는 스키마)
    const users = await prisma.$queryRaw<any[]>`
      SELECT
        u.id,
        u.email,
        u.created_at,
        u.last_sign_in_at,
        u.email_confirmed_at,
        u.raw_user_meta_data,
        u.raw_app_meta_data,
        COUNT(a.id)::int AS login_count
      FROM auth.users u
      LEFT JOIN auth.audit_log_entries a
        ON a.payload->>'actor_id' = u.id::text
        AND a.payload->>'action' = 'login'
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT 200
    `;

    return NextResponse.json({
      users: users.map(u => ({
        id: u.id,
        email: u.email,
        name: u.raw_user_meta_data?.name || u.raw_user_meta_data?.full_name || "-",
        provider: u.raw_app_meta_data?.provider || "email",
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at,
        emailConfirmed: !!u.email_confirmed_at,
        loginCount: u.login_count ?? 0,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
