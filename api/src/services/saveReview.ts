import type { PrismaClient } from "../generated/prisma/client";
import type { ReviewResult } from "@code-review-tool/types";

export async function saveReview(
  pullRequestId: string,
  result: ReviewResult,
  prisma: PrismaClient
) {
  const review = await prisma.$transaction(async (tx) => {
    const created = await tx.review.create({
      data: {
        pullRequestId,
        qualityScore: result.qualityScore,
        summary: result.summary,
      },
    });

    if (result.suggestions.length > 0) {
      await tx.reviewComment.createMany({
        data: result.suggestions.map((s) => ({
          reviewId: created.id,
          filePath: s.filePath,
          lineNumber: s.lineNumber,
          body: s.body,
          severity: s.severity,
        })),
      });
    }

    if (result.securityIssues.length > 0) {
      await tx.securityIssue.createMany({
        data: result.securityIssues.map((s) => ({
          reviewId: created.id,
          type: s.type,
          description: s.description,
          filePath: s.filePath,
          lineNumber: s.lineNumber,
          severity: s.severity,
        })),
      });
    }

    return created;
  });

  return review;
}
