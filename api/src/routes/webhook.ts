import { Router, Request, Response } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { reviewQueue } from "../queue/index";

const router = Router();

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET!;

const PR_ACTIONS = new Set(["opened", "synchronize", "reopened"]);

// Use raw body parser on this router only — must come before any JSON parsing
router.use((_req, _res, next) => next()); // no-op placeholder; raw() is applied per-route below

// ------------------------------------------------------------------
// POST /github/webhook
// ------------------------------------------------------------------
router.post(
  "/github/webhook",
  // express.raw scoped to this route
  (req: Request, res: Response, next) => {
    let data = Buffer.alloc(0);
    req.on("data", (chunk: Buffer) => { data = Buffer.concat([data, chunk]); });
    req.on("end", () => {
      (req as Request & { rawBody: Buffer }).rawBody = data;
      next();
    });
  },
  async (req: Request, res: Response) => {
    // 1. Verify signature
    const sigHeader = req.headers["x-hub-signature-256"] as string | undefined;
    if (!sigHeader) {
      res.status(401).json({ error: "Missing signature" });
      return;
    }

    const rawBody = (req as Request & { rawBody: Buffer }).rawBody;
    const expected = "sha256=" + createHmac("sha256", WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    let trusted = false;
    try {
      trusted = timingSafeEqual(Buffer.from(expected), Buffer.from(sigHeader));
    } catch {
      // buffers differ in length — definitely not equal
    }

    if (!trusted) {
      res.status(401).json({ error: "Invalid signature" });
      return;
    }

    // 2. Parse payload
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      res.status(400).json({ error: "Invalid JSON body" });
      return;
    }

    // 3. Only process relevant PR actions
    const action = payload.action as string | undefined;
    if (!action || !PR_ACTIONS.has(action)) {
      res.status(200).json({ received: true, queued: false });
      return;
    }

    // 4. Extract PR fields
    const pr = payload.pull_request as Record<string, unknown> | undefined;
    const repo = payload.repository as Record<string, unknown> | undefined;

    if (!pr || !repo) {
      res.status(400).json({ error: "Missing pull_request or repository in payload" });
      return;
    }

    const prNumber = pr.number as number;
    const prTitle = pr.title as string;
    const author = (pr.user as Record<string, unknown>)?.login as string;
    const repoFullName = repo.full_name as string;
    const diffUrl = pr.diff_url as string;
    const userId = repo.owner
      ? ((repo.owner as Record<string, unknown>).login as string)
      : "unknown";

    // 5. Enqueue review job
    await reviewQueue.add(
      `review-pr-${repoFullName}-${prNumber}`,
      { prNumber, repoFullName, diffUrl, userId },
      { jobId: `${repoFullName}#${prNumber}-${action}` }
    );

    console.log(`[webhook] Queued review job: PR #${prNumber} "${prTitle}" by ${author} on ${repoFullName}`);

    res.status(200).json({ received: true, queued: true });
  }
);

export default router;
