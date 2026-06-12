# 퀀트 대시보드 개발 계획

## 1. 페이지 구성

| 메뉴 | 경로 | 로그인 | 설명 |
|---|---|---|---|
| 코스닥 시그널 | `/dashboard` | 불필요 (전환) | 기존 대시보드, 비로그인 전환 |
| 시장 게이지 | `/quant` | 불필요 | 공포·과열 지수 + 검색 상위 |
| 시장 국면 | `/quant` | 불필요 | ARDS-X Regime Classifier |
| AI 모멘텀 | `/quant` | 불필요 | AMQS / AMQS-M7 |
| 방어 헤지 | `/quant` | 불필요 | ARDS (대칭 헤지) |
| CASSANDRA | `/` | 필요 | 기존 로그인 |
| 친구 추천 | `/quant` | 불필요 | 공유 링크 복사 |

## 2. 기술 결정

| 항목 | 결정 |
|---|---|
| 프레임워크 | Next.js 15 (기존) |
| 퀀트 지표 계산 | TypeScript (Python → TS 포팅) |
| 시장 데이터 | Naver Finance API (기존) |
| 차트 | Recharts (추가 설치) |
| SEO | Next.js metadata + llms.txt |
| 비로그인 | 미들웨어 예외 경로 추가 |

## 3. 개발 순서

1. 미들웨어 수정 (`/dashboard`, `/quant` 예외)
2. `/quant` 페이지 생성 + 기본 레이아웃
3. 시장 게이지 섹션 (Naver Finance 공포/과열)
4. ARDS-X Regime Classifier (Python → TS)
5. AMQS / AMQS-M7 (Python → TS)
6. ARDS 헤지 전략 (Python → TS)
7. 친구 추천 + 방문자 수
8. 위험 고지 + GitHub 링크
9. Vercel 배포

## 4. 프리티어 체크

| 서비스 | 현재 | 추가 부하 | 한도 |
|---|---|---|---|
| Vercel Func | <1% | +5% (퀀트 계산) | 1M/월 |
| Neon DB | 3.4% | +1% (방문자) | 0.5GB |
| GitHub | <50MB | +5MB | 1GB |

여유 충분 → 프리티어 내 운영 가능.
