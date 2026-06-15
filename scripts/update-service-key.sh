#!/bin/bash
# Supabase Service Role Key 업데이트
echo "Supabase Dashboard → Settings → API → service_role 복사"
echo -n "Service Role Key (eyJhbG...): "
read KEY

# 8번, 13번 줄 교체
sed -i '' "8s|.*|SUPABASE_SERVICE_ROLE_KEY=${KEY}|" .env
sed -i '' "13s|.*|SUPABASE_SERVICE_ROLE_KEY=${KEY}|" .env

echo "✅ 업데이트 완료"
grep "SERVICE_ROLE" .env | sed 's/=.*/=***/'
