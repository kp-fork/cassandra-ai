# 검색 아키텍처 — GitHub 레포 기반 분산 캐시

> **핵심 아이디어**: GitHub 저장소를 무료 JSON 스토리지 + CDN으로 활용하여 $0/월 검색 인프라 구축

---

## 전체 시나리오

```
사용자 검색 요청 (Vercel, $0)
  │
  ├─ 1. GitHub 캐시 (Dart_Data/person-results/{이름}.json) ★
  │     └─ SearchCache DB 인덱스로 1ms 확인
  │     └─ 캐시 히트 → git clone 된 로컬 파일 즉시 반환
  │
  ├─ 2. Redis/인메모리 (72시간 TTL)
  │     └─ Upstash Free 256MB 또는 Map<string,data>
  │
  ├─ 3. Neon DB (541개사, 2,630건 공시, $0)
  │     └─ Filing.title LIKE '%신승수%'
  │
  ├─ 4. Puppeteer (GitHub Actions, 무료 무제한) ★
  │     └─ Vercel 10초 제한 우회 → 6시간 실행
  │     └─ DART 웹사이트 직접 검색 (OpenAPI 미지원 커버)
  │     └─ 결과 → git commit → GitHub 캐시 자동 갱신
  │
  ├─ 5. 빈도 3회 이상 → 영구 저장 (Dart_Data/)
  │     └─ 100일 미검색 → 자동 삭제
  │
  └─ DOM 변경 감지 → "관리자에게 알려주세요" 알림
```

## 장점

| 장점 | 설명 |
|---|---|
| **$0/월 완전 무료** | Vercel + Neon + GitHub Actions + GitHub 스토리지 모두 무료 티어 내 |
| **GitHub = 무료 CDN + DB** | JSON 파일을 git으로 버전 관리, 전 세계 CDN으로 복제 |
| **중복 검색 방지** | SearchCache 인덱스로 1ms 확인 → 불필요한 DART 호출 제거 |
| **Puppeteer 서버리스 우회** | Vercel 10초 제한 → GitHub Actions 6시간으로 해결 |
| **무중단 배포** | GitHub 커밋 → Vercel 자동 재배포 → 항상 최신 캐시 |
| **DOM 변경 자동 감지** | 스크래핑 실패 시 error.json 생성 → 프론트엔드 경고 |
| **확장성** | 10,000명 검색어도 ~50MB (GitHub 1GB 한도 5%) |

## 단점 및 대응

| 단점 | 영향 | 대응 |
|---|---|---|
| GitHub Actions 1~2분 지연 | 사용자 대기 | "DART 공시에서 추가 검색 중..." 표시 |
| Puppeteer DOM 변경 시 실패 | 검색 불가 | error.json → "관리자에게 알려주세요" 경고 |
| 인메모리 캐시 재시작 초기화 | 콜드 스타트 | GitHub 캐시가 1차 방어선 |
| GitHub API rate limit (5,000/h) | 트리거 실패 | Actions 탭에서 수동 실행 가능 |
| Neon cold start (1~2초) | 첫 쿼리 지연 | Connection pool 유지 |
| 100일 미검색 자동 삭제 | 재검색 필요 | "추가 검색" 버튼으로 재크롤링 |
| git push 충돌 (동시 검색) | 커밋 실패 | GitHub Actions가 pull-rebase-push 처리 |

## 비용 분석

| 서비스 | 월 비용 | 용도 |
|---|---|---|
| Vercel Hobby | $0 | 웹 호스팅 + API |
| Neon Free | $0 | PostgreSQL (SearchCache 인덱스) |
| GitHub Actions | $0 | Puppeteer 스크래핑 (공개 레포 무제한) |
| GitHub Storage | $0 | JSON 파일 (1GB 한도) |
| Upstash Redis | $0 (준비) | 핫 캐시 (미사용 시 인메모리 폴백) |
| **총계** | **$0/월** | |

## 유사 사례: GitHub를 DB로 활용

| 프로젝트 | 설명 |
|---|---|
| **JSON as a Database** | GitHub에 JSON 파일을 커밋하여 블로그/위키 CMS로 사용 |
| **github-db** | GitHub API로 CRUD하는 Key-Value 스토어 라이브러리 |
| **Flat Data (GitHub OCTO)** | GitHub Actions + 스크래핑 → JSON 커밋 → 데이터 시각화 |
| **Nocodb** | GitHub를 DB 백엔드로 사용하는 오픈소스 Airtable 대체 |
| **TiddlyWiki** | 단일 HTML 파일을 GitHub Pages로 호스팅하는 위키 |

> **CASSANDRA AI의 차별점**: 위 사례들은 정적 데이터 저장에 그치지만, 우리는 SearchCache 인덱스 + 빈도 기반 영구화 + 자동 만료까지 구현한 **하이브리드 검색 엔진**입니다.
