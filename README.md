# Code Review Tool

An AI-powered code review tool that automatically reviews GitHub pull requests using Claude (Anthropic), posts inline comments, and sends Slack/email notifications.

---

## UI

**Figure 1 — Reviews dashboard**
![Reviews dashboard](images/img1.jpg)

**Figure 2 — Analytics dashboard**
![Analytics dashboard](images/img2.jpg)

**Figure 3 — Slack notification**
![Slack notification](images/img3.jpg)

---

## Architecture

```
code-review-tool/
├── api/          Express + Prisma + BullMQ backend
├── web/          Next.js 14 frontend
├── packages/
│   └── types/    Shared TypeScript interfaces
└── docker-compose.yml  Postgres + Redis
```

**Request flow:**
1. GitHub sends a webhook on PR open/sync
2. API verifies HMAC signature, enqueues a BullMQ job
3. Worker fetches the diff, chunks it, calls Claude for review
4. Review is saved to Postgres, posted to GitHub as inline comments
5. Slack and/or email notifications are sent (fire-and-forget)

---

## Prerequisites

- Node.js 20+
- Docker (for Postgres and Redis)
- A GitHub OAuth App
- An Anthropic API key
- (Optional) Resend API key for email notifications
- (Optional) A public URL for GitHub webhooks (e.g. [ngrok](https://ngrok.com))

---

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Start infrastructure

```bash
docker-compose up -d
```

This starts:
- **Postgres** on `localhost:5433` (main DB)
- **Postgres shadow** on `localhost:5434` (Prisma migrations)
- **Redis** on `localhost:6379`

### 3. Configure environment variables

Copy `.env.example` to `api/.env` and fill in the values:

```bash
cp .env.example api/.env
```

**Required values:**

| Variable | Description |
|---|---|
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5433/code_review_tool?sslmode=disable` |
| `SHADOW_DATABASE_URL` | `postgres://postgres:postgres@localhost:5434/code_review_tool_shadow?sslmode=disable` |
| `REDIS_URL` | `redis://localhost:6379` |
| `JWT_SECRET` | Any random secret string |
| `GITHUB_CLIENT_ID` | From your GitHub OAuth App |
| `GITHUB_CLIENT_SECRET` | From your GitHub OAuth App |
| `GITHUB_CALLBACK_URL` | `http://localhost:4000/auth/github/callback` |
| `WEBHOOK_SECRET` | Any random string (must match your GitHub webhook config) |
| `WEBHOOK_URL` | Public URL where GitHub can reach your API (e.g. ngrok URL) |
| `ANTHROPIC_API_KEY` | From [console.anthropic.com](https://console.anthropic.com) |
| `WEB_URL` | `http://localhost:3000` |

**Optional:**

| Variable | Description |
|---|---|
| `RESEND_API_KEY` | From [resend.com](https://resend.com) for email notifications |

Also create `web/.env.local`:

```bash
echo "NEXT_PUBLIC_API_URL=http://localhost:4000" > web/.env.local
echo "API_URL=http://localhost:4000" >> web/.env.local
```

### 4. Run database migrations

```bash
cd api
npx prisma migrate dev
```

### 5. Start everything

Open **three terminals**:

**Terminal 1 — API server:**
```bash
npm run dev:api
# or: cd api && npm run dev
```

**Terminal 2 — Background worker:**
```bash
cd api
npx ts-node-dev --respawn --transpile-only src/queue/worker.ts
```

**Terminal 3 — Web frontend:**
```bash
npm run dev:web
# or: cd web && npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

---

## Exposing webhooks locally (ngrok)

GitHub needs a public URL to deliver webhook events. In a fourth terminal:

```bash
ngrok http 4000
```

Copy the `https://` URL ngrok gives you and set it in `api/.env`:

```
WEBHOOK_URL=https://abc123.ngrok.io
```

Restart the API server after changing this value.

---

## Setting up GitHub OAuth

1. Go to [GitHub → Settings → Developer settings → OAuth Apps](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Set **Homepage URL** to `http://localhost:3000`
4. Set **Authorization callback URL** to `http://localhost:4000/auth/github/callback`
5. Copy the **Client ID** and **Client Secret** into `api/.env`

---

## Running Tests

```bash
cd api
npm test
```

Tests use Vitest with mocked Prisma, BullMQ, and the Gemini SDK — no real DB or Redis connection needed.

To run in watch mode during development:

```bash
cd api
npx vitest
```

---

## Pages

| Route | Description |
|---|---|
| `/` | Landing page |
| `/login` | GitHub OAuth login |
| `/dashboard` | Overview |
| `/dashboard/repos` | Enable/disable repos, configure notifications |
| `/dashboard/reviews` | Review history with filters and detail panel |
| `/dashboard/analytics` | Charts: score over time, security issues, volume, leaderboard |

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/auth/github` | Start GitHub OAuth flow |
| `GET` | `/auth/me` | Get current user |
| `POST` | `/auth/logout` | Clear session |
| `POST` | `/github/webhook` | GitHub webhook receiver |
| `GET` | `/repos/available` | List GitHub repos with enabled status |
| `POST` | `/repos/register` | Enable a repo (creates webhook) |
| `DELETE` | `/repos/disable` | Disable a repo (removes webhook) |
| `PATCH` | `/repos/settings` | Update notification email/Slack URL |
| `GET` | `/reviews` | Paginated review history |
| `GET` | `/reviews/export` | Download reviews as CSV |
| `GET` | `/analytics` | Aggregate stats and chart data |
| `GET` | `/admin/queues` | BullMQ dashboard |

---

## Tech Stack

- **API:** Express, Prisma, BullMQ, Google Gemini SDK
- **Web:** Next.js 14, Tailwind CSS, Recharts
- **DB:** PostgreSQL (via Prisma)
- **Queue:** Redis + BullMQ
- **Auth:** GitHub OAuth + JWT (httpOnly cookie)
- **Notifications:** Resend (email), Slack Incoming Webhooks
- **CI:** GitHub Actions
