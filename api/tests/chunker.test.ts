import { describe, it, expect } from "vitest";
import { chunkDiff, mergeReviewResults } from "../src/services/chunker";
import type { ReviewResult } from "@code-review-tool/types";

// ─── chunkDiff ─────────────────────────────────────────────────────────────

function makeSyntheticDiff(): { diff: string; filenames: string[] } {
  const filenames: string[] = [];
  const parts: string[] = [];

  for (let i = 0; i < 100; i++) {
    const name = `src/file-${i}.ts`;
    filenames.push(name);

    // Each patch body is 300–2000 chars of fake content
    const bodyLen = 300 + (i * 17) % 1700; // deterministic, varies between 300 and 2000
    const body = ("+" + "x".repeat(79) + "\n").repeat(Math.ceil(bodyLen / 81)).slice(0, bodyLen);

    parts.push(`diff --git a/${name} b/${name}\n--- a/${name}\n+++ b/${name}\n${body}`);
  }

  return { diff: parts.join(""), filenames };
}

describe("chunkDiff", () => {
  it("produces multiple chunks for a large diff", () => {
    const { diff } = makeSyntheticDiff();
    const chunks = chunkDiff(diff, 6000);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("keeps every chunk within the token budget", () => {
    const { diff } = makeSyntheticDiff();
    const chunks = chunkDiff(diff, 6000);
    for (const chunk of chunks) {
      expect(chunk.estimatedTokens).toBeLessThanOrEqual(6000);
    }
  });

  it("includes every file exactly once across all chunks", () => {
    const { diff, filenames } = makeSyntheticDiff();
    const chunks = chunkDiff(diff, 6000);

    const seen = new Map<string, number>();
    for (const chunk of chunks) {
      for (const file of chunk.files) {
        seen.set(file, (seen.get(file) ?? 0) + 1);
      }
    }

    // Every expected file appears exactly once
    for (const name of filenames) {
      expect(seen.get(name), `file ${name} missing or duplicated`).toBe(1);
    }

    // No extra files crept in
    expect(seen.size).toBe(filenames.length);
  });
});

// ─── mergeReviewResults ────────────────────────────────────────────────────

function makeResult(overrides: Partial<ReviewResult> = {}): ReviewResult {
  return {
    qualityScore: 8,
    summary: "Looks good.",
    suggestions: [],
    securityIssues: [],
    positives: ["Clean code"],
    ...overrides,
  };
}

describe("mergeReviewResults", () => {
  it("deduplicates suggestions with the same filePath, lineNumber, and body", () => {
    const shared = {
      filePath: "src/app.ts",
      lineNumber: 10,
      severity: "WARNING" as const,
      body: "Use const instead of let here",
    };

    const r1 = makeResult({ suggestions: [shared, { ...shared, lineNumber: 20, body: "Another suggestion" }] });
    const r2 = makeResult({ suggestions: [shared] }); // duplicate of shared
    const r3 = makeResult({ suggestions: [{ ...shared, lineNumber: 30, body: "Third unique suggestion" }] });

    const merged = mergeReviewResults([r1, r2, r3]);

    // shared appears only once
    const atLine10 = merged.suggestions.filter(
      (s) => s.filePath === "src/app.ts" && s.lineNumber === 10
    );
    expect(atLine10).toHaveLength(1);

    // Total: shared(1) + line20(1) + line30(1) = 3
    expect(merged.suggestions).toHaveLength(3);
  });

  it("computes qualityScore as the rounded average of all results", () => {
    const r1 = makeResult({ qualityScore: 6 });
    const r2 = makeResult({ qualityScore: 7 });
    const r3 = makeResult({ qualityScore: 9 });

    const merged = mergeReviewResults([r1, r2, r3]);
    // (6 + 7 + 9) / 3 = 7.33 → rounds to 7
    expect(merged.qualityScore).toBe(7);
  });

  it("returns empty defaults for an empty input array", () => {
    const merged = mergeReviewResults([]);
    expect(merged.qualityScore).toBe(0);
    expect(merged.suggestions).toHaveLength(0);
    expect(merged.securityIssues).toHaveLength(0);
  });
});
