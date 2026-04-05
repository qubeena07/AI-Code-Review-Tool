import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthRequest } from "../lib/requireAuth";

const router = Router();

const PAGE_SIZE = 20;

function buildWhere(userId: string, query: Record<string, string>) {
  const { repoId, scoreMin, scoreMax, hasSecurityIssues, dateRange } = query;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    pullRequest: {
      repository: { userId },
    },
  };

  if (repoId) {
    where.pullRequest.repositoryId = repoId;
  }

  if (scoreMin !== undefined || scoreMax !== undefined) {
    where.qualityScore = {};
    if (scoreMin !== undefined) where.qualityScore.gte = Number(scoreMin);
    if (scoreMax !== undefined) where.qualityScore.lte = Number(scoreMax);
  }

  if (hasSecurityIssues === "true") {
    where.securityIssues = { some: {} };
  }

  if (dateRange && dateRange !== "all") {
    const days = dateRange === "7d" ? 7 : 30;
    where.createdAt = { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
  }

  return where;
}

// ------------------------------------------------------------------
// GET /reviews
// ------------------------------------------------------------------
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const { userId } = req as AuthRequest;
  const query = req.query as Record<string, string>;
  const page = Math.max(1, Number(query.page ?? 1));

  const where = buildWhere(userId, query);

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where,
      include: {
        pullRequest: { include: { repository: true } },
        comments: true,
        securityIssues: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.review.count({ where }),
  ]);

  res.json({
    data: {
      reviews,
      total,
      page,
      totalPages: Math.ceil(total / PAGE_SIZE),
    },
  });
});

// ------------------------------------------------------------------
// GET /reviews/export  — CSV, all matching records (no pagination)
// ------------------------------------------------------------------
router.get("/export", requireAuth, async (req: Request, res: Response) => {
  const { userId } = req as AuthRequest;
  const query = req.query as Record<string, string>;
  const where = buildWhere(userId, query);

  const reviews = await prisma.review.findMany({
    where,
    include: {
      pullRequest: { include: { repository: true } },
      comments: true,
      securityIssues: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const header = ["prTitle", "repo", "author", "score", "suggestionsCount", "securityIssuesCount", "date", "prUrl"];

  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;

  const rows = reviews.map((r) => {
    const prUrl = `https://github.com/${r.pullRequest.repository.fullName}/pull/${r.pullRequest.number}`;
    return [
      escape(r.pullRequest.title),
      escape(r.pullRequest.repository.fullName),
      escape(r.pullRequest.author),
      String(r.qualityScore),
      String(r.comments.length),
      String(r.securityIssues.length),
      escape(r.createdAt.toISOString()),
      escape(prUrl),
    ].join(",");
  });

  const csv = [header.join(","), ...rows].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="reviews.csv"');
  res.send(csv);
});

export default router;
