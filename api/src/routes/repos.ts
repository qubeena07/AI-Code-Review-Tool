import { Router, Request, Response } from "express";
import axios from "axios";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthRequest } from "../lib/requireAuth";

const router = Router();

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET!;
const WEBHOOK_URL = process.env.WEBHOOK_URL!;

// ------------------------------------------------------------------
// POST /repos/register
// ------------------------------------------------------------------
router.post("/register", requireAuth, async (req: Request, res: Response) => {
  const { userId, userAccessToken } = req as AuthRequest;
  const { fullName } = req.body as { fullName?: string };

  if (!fullName || !fullName.includes("/")) {
    res.status(400).json({ error: "fullName must be in 'owner/repo' format" });
    return;
  }

  // 1. Register GitHub webhook
  let webhookId: string;
  try {
    const { data: hook } = await axios.post<{ id: number }>(
      `https://api.github.com/repos/${fullName}/hooks`,
      {
        name: "web",
        active: true,
        events: ["pull_request"],
        config: {
          url: `${WEBHOOK_URL}/github/webhook`,
          content_type: "json",
          secret: WEBHOOK_SECRET,
          insecure_ssl: "0",
        },
      },
      {
        headers: {
          Authorization: `Bearer ${userAccessToken}`,
          Accept: "application/vnd.github+json",
        },
      }
    );
    webhookId = String(hook.id);
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status : 500;
    const message = axios.isAxiosError(err)
      ? (err.response?.data as { message?: string })?.message ?? err.message
      : "Failed to create webhook";

    // 422 = hook already exists on the repo
    if (status !== 422) {
      res.status(status ?? 500).json({ error: message });
      return;
    }
    // Treat existing hook as a re-registration — webhookId unknown at this point
    webhookId = "existing";
  }

  // 2. Upsert repository in Prisma
  const repository = await prisma.repository.upsert({
    where: { githubRepoId: fullName },
    update: {
      webhookId,
      active: true,
    },
    create: {
      userId,
      githubRepoId: fullName,
      fullName,
      webhookId,
      active: true,
    },
  });

  console.log(`[repos] Registered webhook for ${fullName} (webhookId: ${webhookId})`);

  res.status(201).json({ data: repository });
});

// ------------------------------------------------------------------
// GET /repos — list repos registered by the authenticated user
// ------------------------------------------------------------------
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const { userId } = req as AuthRequest;

  const repos = await prisma.repository.findMany({
    where: { userId },
    orderBy: { fullName: "asc" },
  });

  res.json({ data: repos });
});

// ------------------------------------------------------------------
// GET /repos/available — GitHub repos with enabled status overlay
// ------------------------------------------------------------------
router.get("/available", requireAuth, async (req: Request, res: Response) => {
  const { userId, userAccessToken } = req as AuthRequest;

  const { data: ghRepos } = await axios.get<Array<{
    id: number;
    full_name: string;
    private: boolean;
    stargazers_count: number;
    language: string | null;
  }>>("https://api.github.com/user/repos", {
    headers: {
      Authorization: `Bearer ${userAccessToken}`,
      Accept: "application/vnd.github+json",
    },
    params: { per_page: 100, sort: "updated" },
  });

  const registered = await prisma.repository.findMany({
    where: { userId },
    select: { fullName: true, active: true, slackWebhookUrl: true, notificationEmail: true },
  });
  const registeredMap = new Map(registered.map((r) => [r.fullName, r]));

  const result = ghRepos.map((r) => {
    const reg = registeredMap.get(r.full_name);
    return {
      fullName: r.full_name,
      private: r.private,
      stargazersCount: r.stargazers_count,
      language: r.language,
      enabled: reg?.active ?? false,
      slackWebhookUrl: reg?.slackWebhookUrl ?? "",
      notificationEmail: reg?.notificationEmail ?? "",
    };
  });

  res.json({ data: result });
});

// ------------------------------------------------------------------
// DELETE /repos/disable — remove webhook and mark inactive
// ------------------------------------------------------------------
router.delete("/disable", requireAuth, async (req: Request, res: Response) => {
  const { userId, userAccessToken } = req as AuthRequest;
  const { fullName } = req.body as { fullName?: string };

  if (!fullName) {
    res.status(400).json({ error: "fullName is required" });
    return;
  }

  const repo = await prisma.repository.findFirst({ where: { fullName, userId } });
  if (!repo) {
    res.status(404).json({ error: "Repository not found" });
    return;
  }

  // Delete GitHub webhook (best effort — don't fail if it's already gone)
  if (repo.webhookId && repo.webhookId !== "existing") {
    try {
      await axios.delete(
        `https://api.github.com/repos/${fullName}/hooks/${repo.webhookId}`,
        {
          headers: {
            Authorization: `Bearer ${userAccessToken}`,
            Accept: "application/vnd.github+json",
          },
        }
      );
    } catch (err) {
      console.warn(`[repos] Failed to delete webhook for ${fullName}:`, err);
    }
  }

  await prisma.repository.update({
    where: { id: repo.id },
    data: { active: false, webhookId: null },
  });

  res.json({ data: { fullName, active: false } });
});

// ------------------------------------------------------------------
// PATCH /repos/settings — update notification settings
// ------------------------------------------------------------------
router.patch("/settings", requireAuth, async (req: Request, res: Response) => {
  const { userId } = req as AuthRequest;
  const { fullName, notificationEmail, slackWebhookUrl } = req.body as {
    fullName?: string;
    notificationEmail?: string;
    slackWebhookUrl?: string;
  };

  if (!fullName) {
    res.status(400).json({ error: "fullName is required" });
    return;
  }

  const repo = await prisma.repository.findFirst({ where: { fullName, userId } });
  if (!repo) {
    res.status(404).json({ error: "Repository not found" });
    return;
  }

  const updated = await prisma.repository.update({
    where: { id: repo.id },
    data: {
      notificationEmail: notificationEmail ?? null,
      slackWebhookUrl: slackWebhookUrl ?? null,
    },
  });

  res.json({ data: updated });
});

export default router;
