import axios from "axios";
import type { PRData, ChangedFile } from "@code-review-tool/types";

const DIFF_CHAR_LIMIT = 80_000;
const MAX_FILES = 300;

const ghApi = axios.create({
  baseURL: "https://api.github.com",
  headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
});

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// Parse the Link header to get the next page URL, or null if none
function getNextPageUrl(linkHeader: string | undefined): string | null {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

export async function fetchPRData(
  token: string,
  owner: string,
  repo: string,
  prNumber: number
): Promise<PRData> {
  const basePath = `/repos/${owner}/${repo}/pulls/${prNumber}`;
  const headers = authHeader(token);

  // 1. PR metadata
  const { data: pr } = await ghApi.get<{
    title: string;
    user: { login: string };
    base: { ref: string };
    head: { ref: string };
    body: string | null;
  }>(basePath, { headers });

  // 2. Raw diff
  const { data: rawDiff } = await ghApi.get<string>(basePath, {
    headers: { ...headers, Accept: "application/vnd.github.v3.diff" },
    responseType: "text",
  });

  // 3. Changed files with pagination (max 300 files)
  const allFiles: ChangedFile[] = [];
  let nextUrl: string | null = `https://api.github.com${basePath}/files?per_page=100`;

  while (nextUrl && allFiles.length < MAX_FILES) {
    const response = await axios.get<Array<{
      filename: string;
      status: string;
      additions: number;
      deletions: number;
      patch?: string;
    }>>(nextUrl, { headers: { ...headers, Accept: "application/vnd.github+json" } });

    for (const f of response.data) {
      if (allFiles.length >= MAX_FILES) break;
      allFiles.push({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch ?? "",
      });
    }

    nextUrl = getNextPageUrl(response.headers["link"]);
  }

  // 4. Truncate diff if > 80k chars
  let diff = rawDiff;
  if (diff.length > DIFF_CHAR_LIMIT) {
    let budget = DIFF_CHAR_LIMIT;
    const truncatedFiles: ChangedFile[] = [];

    for (const file of allFiles) {
      if (budget <= 0) {
        truncatedFiles.push({ ...file, patch: "[truncated: diff size limit reached]" });
      } else if (file.patch.length <= budget) {
        truncatedFiles.push(file);
        budget -= file.patch.length;
      } else {
        truncatedFiles.push({
          ...file,
          patch: file.patch.slice(0, budget) + "\n[truncated]",
        });
        budget = 0;
      }
    }

    // Also truncate the raw diff string
    diff = diff.slice(0, DIFF_CHAR_LIMIT) + "\n[truncated: diff exceeded 80,000 characters]";

    return {
      title: pr.title,
      author: pr.user.login,
      baseBranch: pr.base.ref,
      headBranch: pr.head.ref,
      body: pr.body ?? "",
      diff,
      changedFiles: truncatedFiles,
    };
  }

  return {
    title: pr.title,
    author: pr.user.login,
    baseBranch: pr.base.ref,
    headBranch: pr.head.ref,
    body: pr.body ?? "",
    diff,
    changedFiles: allFiles,
  };
}
