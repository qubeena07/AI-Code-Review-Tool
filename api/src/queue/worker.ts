import "dotenv/config";
import { Worker, Job } from "bullmq";
import { connection, ReviewJobData } from "./index";
import { prisma } from "../lib/prisma";
import { fetchPRData } from "../services/github";
import { chunkDiff } from "../services/chunker";
import { reviewCode } from "../services/llm";
import { mergeReviewResults } from "../services/chunker";
import { saveReview } from "../services/saveReview";
import { postReviewToGitHub } from "../services/postReview";
import { sendSlackNotification, sendEmailNotification } from "../services/notifications";
import { logger } from "../middleware/logger";

interface QuotaError extends Error {
  retryAfter?: number;
}

async function reviewPR(job: Job<ReviewJobData>): Promise<void> {
  const { prNumber, repoFullName, userId } = job.data;
  const jobTag = `[job:${job.id} PR#${prNumber} ${repoFullName}]`;

  // 1. Resolve GitHub token — look up the user who owns this repo
  const user = await prisma.user.findFirst({ where: { login: userId } });
  const token = user?.accessToken ?? process.env.GITHUB_TEST_TOKEN;
  if (!token) throw new Error(`${jobTag} No GitHub token available for user "${userId}"`);

  // 2. Find the Repository and PullRequest records in the DB
  const repository = await prisma.repository.findFirst({ where: { fullName: repoFullName } });
  if (!repository) throw new Error(`${jobTag} Repository "${repoFullName}" not found in DB`);

  const pullRequest = await prisma.pullRequest.findFirst({
    where: { repositoryId: repository.id, number: prNumber },
  });
  if (!pullRequest) throw new Error(`${jobTag} PullRequest #${prNumber} not found in DB`);

  // 3. Fetch PR data from GitHub
  logger.info({ jobTag }, "Fetching PR data from GitHub");
  const [owner, repo] = repoFullName.split("/");
  const prData = await fetchPRData(token, owner, repo, prNumber);
  logger.info(
    { jobTag, title: prData.title, files: prData.changedFiles.length, diffLen: prData.diff.length },
    "PR data fetched"
  );

  // 4. Chunk the diff
  const chunks = chunkDiff(prData.diff);
  logger.info({ jobTag, chunks: chunks.length }, "Diff chunked");

  // 5. Review each chunk
  const chunkResults = [];
  for (let i = 0; i < chunks.length; i++) {
    logger.info(
      { jobTag, chunk: i + 1, total: chunks.length, tokens: chunks[i].estimatedTokens },
      "Reviewing chunk"
    );
    const result = await reviewCode(chunks[i].diffChunk);
    chunkResults.push(result);
  }

  // 6. Merge results
  const merged = mergeReviewResults(chunkResults);
  logger.info(
    { jobTag, score: merged.qualityScore, suggestions: merged.suggestions.length, security: merged.securityIssues.length },
    "Review merged"
  );

  // 7. Persist to DB
  const review = await saveReview(pullRequest.id, merged, prisma);
  logger.info({ jobTag, reviewId: review.id }, "Review saved");

  // 8. Post review to GitHub
  await postReviewToGitHub(token, owner, repo, prNumber, merged);
  logger.info({ jobTag }, "GitHub review posted");

  // 9. Send notifications (fire and forget)
  const prUrl = `https://github.com/${repoFullName}/pull/${prNumber}`;
  if (repository.slackWebhookUrl) {
    sendSlackNotification(repository.slackWebhookUrl, merged, prUrl, prData.title);
  }
  if (repository.notificationEmail) {
    sendEmailNotification(repository.notificationEmail, merged, prUrl, prData.title);
  }
}

const worker = new Worker<ReviewJobData>(
  "review-queue",
  async (job: Job<ReviewJobData>) => {
    logger.info(
      { prNumber: job.data.prNumber, repo: job.data.repoFullName },
      "[worker] Processing PR"
    );
    try {
      await reviewPR(job);
    } catch (err) {
      const quotaErr = err as QuotaError;
      if (quotaErr.message === "GEMINI_QUOTA_EXCEEDED") {
        const delay = quotaErr.retryAfter ?? 60_000;
        logger.warn({ delay, jobId: job.id }, "[worker] Gemini quota hit — moving job to delayed");
        await job.moveToDelayed(Date.now() + delay);
        return;
      }
      throw err;
    }
  },
  {
    connection,
    concurrency: 5,
  }
);

worker.on("completed", (job: Job<ReviewJobData>) => {
  logger.info({ jobId: job.id, prNumber: job.data.prNumber }, "[worker] Job completed");
});

worker.on("failed", (job: Job<ReviewJobData> | undefined, err: Error) => {
  logger.error(
    { jobId: job?.id, prNumber: job?.data.prNumber, err: err.message },
    "[worker] Job failed"
  );
});

worker.on("error", (err: Error) => {
  logger.error({ err: err.message }, "[worker] Worker error");
});

process.on("SIGTERM", async () => {
  logger.info("[worker] SIGTERM received — shutting down gracefully");
  await worker.close();
  process.exit(0);
});

logger.info("[worker] Review worker started, waiting for jobs...");

export default worker;
