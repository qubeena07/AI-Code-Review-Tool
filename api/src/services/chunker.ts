import type { DiffChunk, ReviewResult, ReviewSuggestion, ReviewSecurityIssue } from "@code-review-tool/types";

// ---------------------------------------------------------------------------
// chunkDiff
// ---------------------------------------------------------------------------

export function chunkDiff(diff: string, maxTokens = 6000): DiffChunk[] {
  // Split on "diff --git" keeping the header as part of each section
  const parts = diff.split(/(?=diff --git )/).filter((p) => p.trim().length > 0);

  const chunks: DiffChunk[] = [];
  let batchFiles: string[] = [];
  let batchContent = "";
  let batchTokens = 0;

  for (const part of parts) {
    const estimated = Math.ceil(part.length / 4);

    if (estimated > maxTokens) {
      // Flush current batch first
      if (batchFiles.length > 0) {
        chunks.push({ files: batchFiles, diffChunk: batchContent, estimatedTokens: batchTokens });
        batchFiles = [];
        batchContent = "";
        batchTokens = 0;
      }
      // Oversized file gets its own chunk
      const filename = extractFilename(part);
      chunks.push({ files: [filename], diffChunk: part, estimatedTokens: estimated });
      continue;
    }

    if (batchTokens + estimated > maxTokens && batchFiles.length > 0) {
      // Flush current batch
      chunks.push({ files: batchFiles, diffChunk: batchContent, estimatedTokens: batchTokens });
      batchFiles = [];
      batchContent = "";
      batchTokens = 0;
    }

    batchFiles.push(extractFilename(part));
    batchContent += part;
    batchTokens += estimated;
  }

  if (batchFiles.length > 0) {
    chunks.push({ files: batchFiles, diffChunk: batchContent, estimatedTokens: batchTokens });
  }

  return chunks;
}

function extractFilename(fileDiff: string): string {
  // "diff --git a/path/to/file b/path/to/file" — take the b/ path
  const match = fileDiff.match(/^diff --git a\/.+ b\/(.+)/m);
  return match ? match[1] : "unknown";
}

// ---------------------------------------------------------------------------
// mergeReviewResults
// ---------------------------------------------------------------------------

export function mergeReviewResults(results: ReviewResult[]): ReviewResult {
  if (results.length === 0) {
    return { qualityScore: 0, summary: "", suggestions: [], securityIssues: [], positives: [] };
  }

  // qualityScore: average
  const qualityScore = Math.round(
    results.reduce((sum, r) => sum + r.qualityScore, 0) / results.length
  );

  // summary: join all
  const summary = results.map((r) => r.summary).filter(Boolean).join(" ");

  // suggestions: dedup by filePath + lineNumber + body hash, max 20
  const suggestions = deduplicateSuggestions(results.flatMap((r) => r.suggestions)).slice(0, 20);

  // securityIssues: dedup by filePath + lineNumber + type
  // keep all CRITICAL/HIGH, cap others at 10
  const securityIssues = deduplicateSecurityIssues(results.flatMap((r) => r.securityIssues));

  // positives: dedup, max 3
  const positives = deduplicateStrings(results.flatMap((r) => r.positives)).slice(0, 3);

  return { qualityScore, summary, suggestions, securityIssues, positives };
}

function deduplicateSuggestions(items: ReviewSuggestion[]): ReviewSuggestion[] {
  const seen = new Set<string>();
  return items.filter((s) => {
    // Simple body hash: first 60 chars normalised
    const key = `${s.filePath}:${s.lineNumber}:${s.body.slice(0, 60).toLowerCase().replace(/\s+/g, " ")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function deduplicateSecurityIssues(items: ReviewSecurityIssue[]): ReviewSecurityIssue[] {
  const seen = new Set<string>();
  const deduped = items.filter((s) => {
    const key = `${s.filePath}:${s.lineNumber}:${s.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const critical = deduped.filter((s) => s.severity === "CRITICAL" || s.severity === "HIGH");
  const others = deduped.filter((s) => s.severity !== "CRITICAL" && s.severity !== "HIGH").slice(0, 10);

  return [...critical, ...others];
}

function deduplicateStrings(items: string[]): string[] {
  return [...new Set(items.map((s) => s.trim()).filter(Boolean))];
}
