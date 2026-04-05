# Testing Workflow — Step by Step

This guide walks through the full end-to-end flow of the application with exactly what to expect at each step.

---

## Prerequisites

Before starting, make sure all services are running:

```bash
# Terminal 1 — API server
npm run dev:api

# Terminal 2 — Background worker
cd api && npx ts-node-dev --respawn --transpile-only src/queue/worker.ts

# Terminal 3 — Web frontend
npm run dev:web

# Terminal 4 — ngrok (to receive GitHub webhooks)
ngrok http 4000
```

Make sure `api/.env` has the ngrok URL set:
```
WEBHOOK_URL=https://your-ngrok-url.ngrok.io
```

---

## Step 1 — Sign in

**Go to:** http://localhost:3000

**What happens:**
- You are redirected to `/login`
- Click **Sign in with GitHub**
- GitHub asks you to authorize the OAuth App
- You are redirected back to `/dashboard/repos`

**What to expect:**
- You should land on the Repositories page
- Your GitHub username appears in the top-right corner of the nav bar

**What NOT to expect:**
- Do not expect repos to appear immediately — you need to enable them first (Step 2)

---

## Step 2 — Enable a Repository

**Go to:** `/dashboard/repos`

**What happens:**
- Your GitHub repositories are listed (public + private you own)
- Each repo shows its language, star count, and a toggle switch

**What to do:**
- Find the repo you want to review PRs for
- Toggle the switch to **ON**

**What to expect:**
- The toggle turns blue/enabled
- The API creates a GitHub webhook on that repo pointing to your ngrok URL
- A settings panel appears below the repo name — you can optionally add a notification email or Slack webhook URL

**What NOT to expect:**
- Private repos you don't own will not appear
- If ngrok is not running or `WEBHOOK_URL` is wrong, toggling will succeed in the DB but GitHub webhook creation will fail silently — check the API terminal for errors

---

## Step 3 — Open a Pull Request

**Go to:** Your enabled GitHub repository

**What to do:**
- Create a new branch with some code changes
- Open a Pull Request against the default branch

**What to expect in the API terminal:**
```
[POST /github/webhook] PR #X opened — qubeena07/your-repo
[worker] Processing PR #X from repo qubeena07/your-repo
[job:... PR#X] Fetching PR data from GitHub...
[job:... PR#X] Fetched: "your PR title", N files, diff XXXX chars
[job:... PR#X] Split into N chunk(s)
[job:... PR#X] Reviewing chunk 1/1 (~XXXX tokens)...
[job:... PR#X] Merged results: score=X, suggestions=X, securityIssues=X
[job:... PR#X] Saved review id=...
[job:... PR#X] Posting review to GitHub...
[job:... PR#X] Posted GitHub review
[worker] Job ... completed — PR #X
```

**What to expect on GitHub:**
- Within ~30–60 seconds, the PR will have an AI review
- Review appears as a comment thread with inline suggestions per file
- Review verdict: APPROVE (score ≥ 8), COMMENT (score 6–7), REQUEST CHANGES (score < 6)

**What NOT to expect:**
- Do not expect instant results — the LLM call takes ~10–20 seconds
- If you see `SASL: client password must be a string`, the worker is missing `.env` — make sure `import "dotenv/config"` is the first line in `worker.ts` and restart the worker
- If the PR has no diff (e.g., empty commit), the review will still run but may return a low-information result

---

## Step 4 — View Reviews

**Go to:** `/dashboard/reviews`

**What to expect:**
- A table showing all reviewed PRs with: title, repo, author, quality score (color coded), security issue count, time
- Click any row to open a detail panel on the right showing:
  - Overall score and summary
  - Per-file suggestions
  - Security issues with recommendations (if any)

**Filters available:**
- Date range: Last 7 days / Last 30 days / All time
- Score: Good (8–10) / Okay (6–7) / Poor (0–5)
- Security issues only checkbox
- Repo dropdown

**Export:**
- Click **Export CSV** to download all matching reviews as a CSV file

**What NOT to expect:**
- If no PRs have been reviewed yet, the table will be empty — complete Step 3 first
- Analytics charts will also be empty until at least one review exists

---

## Step 5 — View Analytics

**Go to:** `/dashboard/analytics`

**What to expect:**
- 4 metric cards: average score, total reviews, total security issues, reviews this week
- **Line chart:** Daily average quality score over the last 90 days
- **Bar chart:** Top security issue types (e.g., SQL_INJECTION, XSS)
- **Area chart:** Weekly review volume stacked by repo
- **Leaderboard:** Authors ranked by average quality score

**What NOT to expect:**
- With only 1–2 reviews, charts will look sparse — this is normal
- Security bar chart only shows if security issues were found
- Leaderboard requires at least 1 review

---

## Step 6 — Notifications (Optional)

**Slack:**
- In `/dashboard/repos`, click the repo name (when enabled) to open settings
- Enter your Slack Incoming Webhook URL
- Click **Save**
- Next time a PR is reviewed, a Block Kit message is sent to your Slack channel

**Email:**
- Enter a notification email in the same settings panel
- An HTML email is sent via Resend after each review
- Requires `RESEND_API_KEY` in `api/.env`

---

## Common Issues

| Problem | Cause | Fix |
|---|---|---|
| Repos page shows empty or ECONNREFUSED | `API_URL` missing in `web/.env.local` | Add `API_URL=http://localhost:4000` to `web/.env.local` |
| Worker fails with SASL error | Worker process not loading `.env` | Ensure `import "dotenv/config"` is first line in `worker.ts`, restart worker |
| No webhook received | ngrok not running or wrong `WEBHOOK_URL` | Run `ngrok http 4000`, update `WEBHOOK_URL` in `api/.env`, restart API |
| GitHub webhook shows failed delivery | Webhook secret mismatch | Make sure `WEBHOOK_SECRET` in `api/.env` matches the secret set in GitHub repo settings |
| Reviews page is empty | No PRs reviewed yet | Open a PR on an enabled repo and wait for worker to process it |
| Toggle fails on repos page | GitHub webhook creation failed | Check API terminal for error; usually ngrok URL issue |

---

## Resetting for a Fresh Test

```bash
# Delete all reviews from DB
docker exec -i <postgres-container-id> psql -U postgres -d code_review_tool -c 'DELETE FROM "Review";'

# Or open a new PR on the same repo to add more data
```
