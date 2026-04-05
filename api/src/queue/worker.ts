import { Worker, Job } from "bullmq";
import { connection, ReviewJobData } from "./index";
import { prisma } from "../lib/prisma";
import { fetchPRData } from "../services/github";
import { chunkDiff } from "../services/chunker";
import { reviewCode } from "../services/llm";
import { mergeReviewResults } from "../services/chunker";
import { saveReview } from "../services/saveReview";
import { postReviewToGitHub } from "../services/postReview";

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
  console.log(`${jobTag} Fetching PR data from GitHub...`);
  const [owner, repo] = repoFullName.split("/");
  const prData = await fetchPRData(token, owner, repo, prNumber);
  console.log(`${jobTag} Fetched: "${prData.title}", ${prData.changedFiles.length} files, diff ${prData.diff.length} chars`);

  // 4. Chunk the diff
  const chunks = chunkDiff(prData.diff);
  console.log(`${jobTag} Split into ${chunks.length} chunk(s)`);

  // 5. Review each chunk
  const chunkResults = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`${jobTag} Reviewing chunk ${i + 1}/${chunks.length} (~${chunks[i].estimatedTokens} tokens)...`);
    const result = await reviewCode(chunks[i].diffChunk);
    chunkResults.push(result);
  }

  // 6. Merge results
  const merged = mergeReviewResults(chunkResults);
  console.log(`${jobTag} Merged results: score=${merged.qualityScore}, suggestions=${merged.suggestions.length}, securityIssues=${merged.securityIssues.length}`);

  // 7. Persist to DB
  const review = await saveReview(pullRequest.id, merged, prisma);
  console.log(`${jobTag} Saved review id=${review.id}`);

  // 8. Post review to GitHub
  console.log(`${jobTag} Posting review to GitHub...`);
  await postReviewToGitHub(token, owner, repo, prNumber, merged);
  console.log(`${jobTag} Posted GitHub review`);
}

const worker = new Worker<ReviewJobData>(
  "review-queue",
  async (job: Job<ReviewJobData>) => {
    console.log(`[worker] Processing PR #${job.data.prNumber} from repo ${job.data.repoFullName}`);
    await reviewPR(job);
  },
  {
    connection,
    concurrency: 5,
  }
);

worker.on("completed", (job: Job<ReviewJobData>) => {
  console.log(`[worker] Job ${job.id} completed — PR #${job.data.prNumber}`);
});

worker.on("failed", (job: Job<ReviewJobData> | undefined, err: Error) => {
  console.error(`[worker] Job ${job?.id ?? "unknown"} failed — PR #${job?.data.prNumber ?? "?"}: ${err.message}`);
});

worker.on("error", (err: Error) => {
  console.error("[worker] Worker error:", err.message);
});

process.on("SIGTERM", async () => {
  console.log("[worker] SIGTERM received — shutting down gracefully");
  await worker.close();
  process.exit(0);
});

console.log("[worker] Review worker started, waiting for jobs...");

export default worker;
