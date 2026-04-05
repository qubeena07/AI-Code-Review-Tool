/**
 * Quick test script for fetchPRData.
 *
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json scripts/test-fetch.ts \
 *     <owner> <repo> <prNumber> [githubToken]
 *
 * If githubToken is omitted, reads GITHUB_TEST_TOKEN env var (or falls back to
 * the access token stored for the first user in the DB).
 *
 * Example:
 *   GITHUB_TEST_TOKEN=ghp_xxx npx ts-node --project tsconfig.scripts.json \
 *     scripts/test-fetch.ts qubeena07 Habit-tracker-using-NLP-and-fastapi 1
 */

import "dotenv/config";
import { fetchPRData } from "../src/services/github";

async function main() {
  const [, , owner, repo, prNumberStr, tokenArg] = process.argv;

  if (!owner || !repo || !prNumberStr) {
    console.error("Usage: test-fetch.ts <owner> <repo> <prNumber> [token]");
    process.exit(1);
  }

  const prNumber = parseInt(prNumberStr, 10);
  const token = tokenArg ?? process.env.GITHUB_TEST_TOKEN;

  if (!token) {
    console.error(
      "No token provided. Pass as 4th arg or set GITHUB_TEST_TOKEN env var."
    );
    process.exit(1);
  }

  console.log(`\nFetching PR #${prNumber} from ${owner}/${repo}...\n`);

  const data = await fetchPRData(token, owner, repo, prNumber);

  console.log("=== PR Metadata ===");
  console.log("Title      :", data.title);
  console.log("Author     :", data.author);
  console.log("Base branch:", data.baseBranch);
  console.log("Head branch:", data.headBranch);
  console.log("Body       :", data.body ? data.body.slice(0, 200) + (data.body.length > 200 ? "..." : "") : "(empty)");

  console.log("\n=== Changed Files ===");
  for (const f of data.changedFiles) {
    console.log(`  ${f.status.padEnd(10)} +${f.additions} -${f.deletions}  ${f.filename}`);
  }
  console.log(`\nTotal files: ${data.changedFiles.length}`);

  console.log("\n=== Diff ===");
  console.log(`Diff length: ${data.diff.length} chars`);
  if (data.diff.length > 0) {
    console.log("First 500 chars:");
    console.log(data.diff.slice(0, 500));
    if (data.diff.length > 500) console.log("...[truncated for display]");
  }
}

main().catch((err) => {
  console.error("Error:", err.response?.data ?? err.message);
  process.exit(1);
});
