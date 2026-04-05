import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthRequest } from "../lib/requireAuth";

const router = Router();

router.get("/", requireAuth, async (req: Request, res: Response) => {
  const { userId } = req as AuthRequest;

  // All queries are scoped to repos owned by this user via JOIN/subquery
  const [summary, scoreTimeline, issueTypes, weeklyVolume, leaderboard] =
    await Promise.all([

      // a. Summary stats
      prisma.$queryRaw<Array<{
        avg_score: number;
        total_reviews: bigint;
        total_security: bigint;
        this_week: bigint;
      }>>`
        SELECT
          ROUND(AVG(r."qualityScore")::numeric, 1) AS avg_score,
          COUNT(*) AS total_reviews,
          (SELECT COUNT(*) FROM "SecurityIssue" si
            JOIN "Review" r2 ON si."reviewId" = r2.id
            JOIN "PullRequest" pr2 ON r2."pullRequestId" = pr2.id
            JOIN "Repository" repo2 ON pr2."repositoryId" = repo2.id
            WHERE repo2."userId" = ${userId}
          ) AS total_security,
          COUNT(CASE WHEN r."createdAt" >= NOW() - INTERVAL '7 days' THEN 1 END) AS this_week
        FROM "Review" r
        JOIN "PullRequest" pr ON r."pullRequestId" = pr.id
        JOIN "Repository" repo ON pr."repositoryId" = repo.id
        WHERE repo."userId" = ${userId}
      `,

      // b. Score timeline (last 90 days, daily avg)
      prisma.$queryRaw<Array<{
        date: Date;
        avg_score: number;
        count: bigint;
      }>>`
        SELECT
          DATE(r."createdAt") AS date,
          ROUND(AVG(r."qualityScore")::numeric, 2) AS avg_score,
          COUNT(*) AS count
        FROM "Review" r
        JOIN "PullRequest" pr ON r."pullRequestId" = pr.id
        JOIN "Repository" repo ON pr."repositoryId" = repo.id
        WHERE repo."userId" = ${userId}
          AND r."createdAt" >= NOW() - INTERVAL '90 days'
        GROUP BY DATE(r."createdAt")
        ORDER BY date ASC
      `,

      // c. Top security issue types
      prisma.$queryRaw<Array<{
        type: string;
        severity: string;
        count: bigint;
      }>>`
        SELECT si.type, si.severity, COUNT(*) AS count
        FROM "SecurityIssue" si
        JOIN "Review" r ON si."reviewId" = r.id
        JOIN "PullRequest" pr ON r."pullRequestId" = pr.id
        JOIN "Repository" repo ON pr."repositoryId" = repo.id
        WHERE repo."userId" = ${userId}
        GROUP BY si.type, si.severity
        ORDER BY count DESC
        LIMIT 10
      `,

      // d. Weekly review volume (last 12 weeks) per repo
      prisma.$queryRaw<Array<{
        week: Date;
        full_name: string;
        count: bigint;
      }>>`
        SELECT
          DATE_TRUNC('week', r."createdAt") AS week,
          repo."fullName" AS full_name,
          COUNT(*) AS count
        FROM "Review" r
        JOIN "PullRequest" pr ON r."pullRequestId" = pr.id
        JOIN "Repository" repo ON pr."repositoryId" = repo.id
        WHERE repo."userId" = ${userId}
          AND r."createdAt" >= NOW() - INTERVAL '12 weeks'
        GROUP BY week, repo."fullName"
        ORDER BY week ASC
      `,

      // e. Author leaderboard
      prisma.$queryRaw<Array<{
        author: string;
        avg_score: number;
        total_reviews: bigint;
      }>>`
        SELECT
          pr.author,
          ROUND(AVG(r."qualityScore")::numeric, 1) AS avg_score,
          COUNT(*) AS total_reviews
        FROM "Review" r
        JOIN "PullRequest" pr ON r."pullRequestId" = pr.id
        JOIN "Repository" repo ON pr."repositoryId" = repo.id
        WHERE repo."userId" = ${userId}
        GROUP BY pr.author
        HAVING COUNT(*) >= 1
        ORDER BY avg_score DESC
        LIMIT 10
      `,
    ]);

  // Serialize BigInts to numbers for JSON
  const s = summary[0] ?? { avg_score: 0, total_reviews: 0n, total_security: 0n, this_week: 0n };

  res.json({
    data: {
      summary: {
        avgScore: Number(s.avg_score),
        totalReviews: Number(s.total_reviews),
        totalSecurity: Number(s.total_security),
        thisWeek: Number(s.this_week),
      },
      scoreTimeline: scoreTimeline.map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        avg_score: Number(r.avg_score),
        count: Number(r.count),
      })),
      issueTypes: issueTypes.map((r) => ({
        type: r.type,
        severity: r.severity,
        count: Number(r.count),
      })),
      weeklyVolume: weeklyVolume.map((r) => ({
        week: r.week.toISOString().slice(0, 10),
        full_name: r.full_name,
        count: Number(r.count),
      })),
      leaderboard: leaderboard.map((r) => ({
        author: r.author,
        avg_score: Number(r.avg_score),
        total_reviews: Number(r.total_reviews),
      })),
    },
  });
});

export default router;
