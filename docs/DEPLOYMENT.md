# Deployment Guide

## Railway (Backend + Worker)

a. Push repo to GitHub
b. Go to railway.app → New Project → Deploy from GitHub repo
c. Add plugins: PostgreSQL, Redis
d. Set these environment variables on the "api" service:

| Variable               | Value                                              |
|------------------------|----------------------------------------------------|
| `DATABASE_URL`         | (auto-filled by Railway PostgreSQL plugin)         |
| `REDIS_URL`            | (auto-filled by Railway Redis plugin)              |
| `GITHUB_CLIENT_ID`     |                                                    |
| `GITHUB_CLIENT_SECRET` |                                                    |
| `GITHUB_CALLBACK_URL`  | `https://your-api.railway.app/auth/github/callback`|
| `JWT_SECRET`           | generate: `openssl rand -hex 32`                   |
| `WEBHOOK_SECRET`       | generate: `openssl rand -hex 32`                   |
| `WEBHOOK_URL`          | `https://your-api.railway.app`                     |
| `GEMINI_API_KEY`       | from [aistudio.google.com](https://aistudio.google.com) |
| `RESEND_API_KEY`       |                                                    |
| `FRONTEND_URL`         | `https://your-app.vercel.app`                      |
| `NODE_ENV`             | `production`                                       |

e. Copy the same env vars to the "worker" service
f. Run migration:
   ```
   railway run --service api npx prisma migrate deploy
   ```

## Vercel (Frontend)

g. Go to vercel.com → New Project → Import GitHub repo → select `web/` as root directory
h. Set environment variable:

| Variable              | Value                              |
|-----------------------|------------------------------------|
| `NEXT_PUBLIC_API_URL` | `https://your-api.railway.app`     |

i. Deploy

## Post-deploy checks

j. Visit `https://your-app.vercel.app/login` — GitHub OAuth must work
k. Update GitHub OAuth App callback URL to Railway domain
l. Open a test PR on a connected repo
m. Check Railway logs for worker job processing
n. Verify PR receives inline review comments on GitHub
o. Check Slack channel for notification
