import axios from "axios";
import type { ReviewResult } from "@code-review-tool/types";

const ghApi = axios.create({
  baseURL: "https://api.github.com",
  headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
});

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** Parse a file's patch string and return a map of source line number → diff position. */
function buildLineToPositionMap(patch: string): Map<number, number> {
  const map = new Map<number, number>();
  let position = 0;
  let lineNumber = 0;

  for (const line of patch.split("\n")) {
    if (line.startsWith("@@")) {
      // e.g. @@ -10,6 +12,8 @@  — extract the new-file start line
      const match = line.match(/\+(\d+)/);
      lineNumber = match ? parseInt(match[1], 10) - 1 : lineNumber;
      position++;
    } else if (line.startsWith("+")) {
      lineNumber++;
      position++;
      map.set(lineNumber, position);
    } else if (line.startsWith("-")) {
      position++;
      // deleted lines don't advance lineNumber
    } else if (line.startsWith(" ")) {
      lineNumber++;
      position++;
    }
    // No-newline marker "\" — skip
  }

  return map;
}

interface GitHubPRFile {
  filename: string;
  patch?: string;
}

interface GitHubReviewComment {
  path: string;
  position: number;
  body: string;
}

export async function postReviewToGitHub(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  review: ReviewResult
): Promise<void> {
  const headers = authHeader(token);
  const basePath = `/repos/${owner}/${repo}/pulls/${prNumber}`;

  // 1. Fetch changed files to build filename → position map
  const { data: files } = await ghApi.get<GitHubPRFile[]>(`${basePath}/files`, {
    headers,
    params: { per_page: 100 },
  });

  const filePositionMaps = new Map<string, Map<number, number>>();
  for (const file of files) {
    if (file.patch) {
      filePositionMaps.set(file.filename, buildLineToPositionMap(file.patch));
    }
  }

  // 2. Map ReviewComment[] to GitHub inline comment format
  const mappedComments: GitHubReviewComment[] = [];
  for (const comment of review.suggestions) {
    const posMap = filePositionMaps.get(comment.filePath);
    if (!posMap) continue;
    const position = posMap.get(comment.lineNumber);
    if (!position) continue;
    mappedComments.push({
      path: comment.filePath,
      position,
      body: `**[${comment.severity}]** ${comment.body}`,
    });
  }

  // 3. Determine review event from quality score
  // Never use APPROVE — GitHub rejects self-reviews with 422
  let event: "COMMENT" | "REQUEST_CHANGES";
  if (review.qualityScore >= 6) {
    event = "COMMENT";
  } else {
    event = "REQUEST_CHANGES";
  }

  // 4. Build review body markdown
  const criticalOrHigh = review.securityIssues.filter(
    (i) => i.severity === "CRITICAL" || i.severity === "HIGH"
  );

  let body = `## AI Code Review — Score: ${review.qualityScore}/10\n\n`;
  body += `${review.summary}\n\n`;
  body += `**Suggestions:** ${review.suggestions.length} | **Security Issues:** ${review.securityIssues.length}`;

  if (criticalOrHigh.length > 0) {
    body += `\n\n### Critical/High Security Issues\n`;
    for (const issue of criticalOrHigh) {
      body += `\n- **[${issue.severity}] ${issue.type}** in \`${issue.filePath}:${issue.lineNumber}\`\n`;
      body += `  ${issue.description}\n`;
      body += `  **Fix:** ${issue.recommendation}`;
    }
  }

  // 5. POST the review (cap at 30 inline comments)
  await ghApi.post(
    `${basePath}/reviews`,
    {
      event,
      body,
      comments: mappedComments.slice(0, 30),
    },
    { headers }
  );
}
