# 검색 아키텍처 — GitHub 레포 기반 분산 캐시

## 시나리오

```
사용자 검색 요청
  │
  ├─ 1. GitHub 캐시 (Dart_Data/person-results/{이름}.json)
  │     └─ SearchCache DB 인덱스 확인 → 즉시 반환 (가장 빠름)
  │
  ├─ 2. Redis/인메모리 (72시간 TTL)
  │
  ├─ 3. Neon DB (541개사, 2,630건 공시)
  │
  ├─ 4. Puppeteer (GitHub Actions)
  │     └─ Vercel 10초 제한 우회 → 6시간 실행 가능
  │     └─ 결과 → GitHub + DB 저장
  │
  └─ 검색 3회 이상 → 영구 저장
        검색 100일 이상 미사용 → 자동 삭제
```

## 무료 티어 한도

| 서비스 | 한도 | 예상 사용량 |
|---|---|---|
| GitHub 저장소 | 1~5GB | 1,000명 × 5KB = 5MB |
| GitHub Actions | 무제한 (공개) | 월 100회 |
| Neon DB | 0.5GB | 인덱스 1MB |
| Vercel Func | 1M/월 | ~10만/월 |

## 단점

| 단점 | 영향 | 대응 |
|---|---|---|
| GitHub Actions 1~2분 지연 | 사용자 대기 | "검색 중..." 표시 |
| Puppeteer 불안정 (DOM 변경) | 검색 실패 가능 | 폴백 메시지 |
| 인메모리 캐시 재시작 초기화 | 캐시 미스 증가 | GitHub 캐시가 1차 |
| GItHub API rate limit (5,000/h) | 트리거 실패 | 워크플로우 직접 실행 |
| Neon cold start | 첫 쿼리 1~2초 | Connection pool |
| 100일 미사용 자동 삭제 | 재검색 필요 | 사용자 안내 |
