# CASSANDRA AI

> [!IMPORTANT]
> **This project is part of the [vibe-investing](https://github.com/gameworkerkim/vibe-investing) monorepo.**
> Visit the main repo for more quant strategies, columns, papers, security tools (LAON VaultGuard), and investment dashboards.

> **Toss X DART X LLM Risk Monitoring**
>
> Real-time KOSDAQ DART disclosure analysis + relationship graph + saju-based stock matching + persona investment AI
>
> **Toss Securities API** for real-time Korean stock prices

**Deployment**: [dart-monitor-pi.vercel.app](https://dart-monitor-pi.vercel.app)
**Korean**: [README.md](README.md)

---

## Core Concept

**$0/month infrastructure** — using GitHub as free JSON storage and CDN.
Built with Vercel + Neon PostgreSQL + Upstash Redis + Supabase Auth + GitHub Actions.

```
Infrastructure cost: $0/month
├── Vercel Hobby          → Web hosting + API ($0)
├── Neon Free             → PostgreSQL 0.5GB ($0)
├── Upstash Redis Free    → Cache 256MB ($0)
├── Supabase Auth Free    → 50,000 MAU ($0)
└── GitHub Actions        → Crawler/scraper (unlimited for public repos)
```

---

## Menu Structure

| Menu | Path | Auth | Description |
|------|------|------|-------------|
| KOSDAQ Signals | `/dashboard` | Login | DART-based high-risk signals (CB issuance, lawsuits, holder changes) |
| Quant Dashboard | `/quant` | Login | Market overview, ETFs, sectors, indices, Fear & Greed, MU-Hynix |
| Persona Investment | `/persona` | Login | Buffett, Wood, Dalio 3-persona AI stock analysis |
| Saju Fortune | `/saju` | Public | 60-gapja saju + stock compatibility |
| Relationship Graph | `/` | Expert | Cytoscape.js network (company-person-fund) |
| Reports/Analysis | `/board` | Expert | User reports + AI analysis + friend invites |
| WIKI | `/wiki` | Expert | Stock celebrities + same-name management |
| Person Search | `/person-search` | Expert | DART person lookup + history |
| Admin | `/admin` | Admin | User stats, Expert approval, referrals, saju logs |

---

## Key Features

### KOSDAQ Signals
- **Toss Securities API** for real-time Korean stock prices
- DART 12-month disclosure data (name changes, holder changes, lawsuits)
- CB issuance/refixing 67 records (6 refixing flagged as high-risk)
- 8 signal rules: CB issuance, CB refixing, name change, holder change, lawsuit dispute, capital change, audit risk, payment delay
- GitHub Actions auto-sync daily at 09:00/18:00 KST

### Quant Dashboard
- Market overview: 10 popular ETFs, 11 sectors, major indices (SPY, QQQ, DIA, IWM), VIX
- Sector Fear & Greed: 10 US sector ETFs, 5-signal weighted average
- ARDS-X: NASDAQ Top 100 market regime 4-stage classification
- AMQS/M7: AI semiconductor momentum strategy
- MU -> SK Hynix: Cross-market regression prediction (71% accuracy)
- NASDAQ gainers/losers TOP (daily + weekly)

### Saju Fortune
- 60-gapja based 4 pillars (year/month/day/time) full calculation
- Ten Gods (SipSin), Great Fortune (DaeUn 80 years), Hidden Stems (JiJangGan)
- Harmony/Clash/Punishment (HapChungHyungHae), 12 Life Stages, Strength/Weakness
- Useful God (YongSin) / Favorable God (HeeSin) / Unfavorable God (GiSin)
- 5 fortune scores (wealth/business/study/love/health) based on day master
- Weekly/monthly/yearly fortune simulation + trend + comprehensive summary
- Stock element compatibility analysis (ticker/Korean name search)
- Query limits: anonymous 3/day, logged in 5/day, +3 per referral

### Persona Investment
- Warren Buffett: value investing, economic moat, undervalued quality stocks
- Cathie Wood: disruptive innovation, AI/robotics/genomics focus
- Ray Dalio: macro cycles, risk parity, all-weather strategy
- Yahoo Finance real-time price-based scenario analysis
- Leveraged ETF auto-detection and warnings
- 12 stocks X 3 personas = 36 auto-precached analyses

### Authentication
- Supabase Auth: Google OAuth + email/password
- 3-tier system: Regular (Google login) / Expert (media/gov email verification) / Admin
- Expert: domain check -> admin approval -> OTP verification -> 6-month re-verification
- Expert invite: enter journalist email -> generate invite link -> track invite history

---

## Data

| Item | Scale |
|------|-------|
| DB Companies | 622 |
| DB Filings | 984 |
| DB Signals | 141 |
| DB Relations | 5,000+ CorpPersonRelation |
| DART Mapping | 3,920 KOSDAQ |
| Real-time Prices | Toss Securities API |
| Popular ETFs | NASDAQ 10 |
| Persona Stocks | NASDAQ/KOSPI 200 |

---

## Quick Start

```bash
npm run dev              # Development server
npm run daily            # Daily DART sync + signal generation
npm run extract-cb       # Extract CB issuance/refixing
npm run extract-dart     # Extract DART 12-month events
npm run saju-stats       # Saju service statistics
npm run logs             # Login/visitor statistics
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 + TypeScript |
| Database | PostgreSQL (Neon Serverless) |
| ORM | Prisma 6 |
| Cache | Upstash Redis |
| Auth | Supabase Auth (Google OAuth) |
| UI | React 19 + Tailwind CSS 4 + Recharts + Cytoscape.js |
| Real-time Prices | Toss Securities API + Yahoo Finance |
| External APIs | DART OpenAPI, Naver Finance |
| Deployment | Vercel ($0) + Neon ($0) + Supabase ($0) |

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon PostgreSQL |
| `DART_API_KEY` | DART OpenAPI |
| `TOSS_CLIENT_ID`, `TOSS_CLIENT_SECRET` | Toss Securities API |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Auth |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Auth |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase server-side |
| `UPSTASH_REDIS_REST_URL` | Redis cache |
| `UPSTASH_REDIS_REST_TOKEN` | Redis cache |
| `DEEPSEEK_API_KEY` | LLM analysis (optional) |

---

## Documentation

- [ROADMAP.md](docs/ROADMAP.md) — Roadmap + history
- [SERVICE_FLOW.md](docs/SERVICE_FLOW.md) — Service flow
- [CHANGELOG.md](docs/CHANGELOG.md) — Change log
- [AUTH_SYSTEM.md](docs/AUTH_SYSTEM.md) — Authentication system design
- [EXPERT_MANUAL.md](docs/EXPERT_MANUAL.md) — Expert authentication manual
- [REFRESH_POLICY.md](docs/REFRESH_POLICY.md) — Data refresh policy
- [dev_llms.txt](docs/dev_llms.txt) — LLM development spec
- [REFACTORING_PLAN.md](docs/REFACTORING_PLAN.md) — Graph refactoring plan

---

## License

Public interest. Commercial use restricted.
