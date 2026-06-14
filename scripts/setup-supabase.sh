#!/bin/bash
# Supabase 키 등록 스크립트
set -e

echo ""
echo "🔐 Supabase 키 등록"
echo "========================================="
echo ""
echo "Supabase 대시보드 → Settings → API 에서 복사하세요."
echo ""

# URL 입력
echo -n "Supabase URL (https://xxxxx.supabase.co): "
read SUPABASE_URL

echo -n "Anon Key (NEXT_PUBLIC): "
read SUPABASE_ANON_KEY

echo -n "Service Role Key: "
read SUPABASE_SERVICE_ROLE_KEY

# .env 에 추가
if grep -q "NEXT_PUBLIC_SUPABASE_URL" .env 2>/dev/null; then
  # 기존 값 교체
  sed -i '' "s|^NEXT_PUBLIC_SUPABASE_URL=.*|NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}|" .env
  sed -i '' "s|^NEXT_PUBLIC_SUPABASE_ANON_KEY=.*|NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}|" .env
  sed -i '' "s|^SUPABASE_SERVICE_ROLE_KEY=.*|SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}|" .env
else
  echo "" >> .env
  echo "# Supabase Auth" >> .env
  echo "NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}" >> .env
  echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}" >> .env
  echo "SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}" >> .env
fi

echo ""
echo "✅ .env 업데이트 완료"
echo ""
echo "다음: npm run dev"
