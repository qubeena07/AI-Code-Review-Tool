/**
 * Test script for chunkDiff.
 *
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json scripts/test-chunker.ts
 */

import { chunkDiff } from "../src/services/chunker";

// ---------------------------------------------------------------------------
// Build a synthetic diff with 50 fake files of varying sizes
// ---------------------------------------------------------------------------

function makeFakeFileDiff(index: number, lineCount: number): string {
  const path = `src/module-${index}/file-${index}.ts`;
  const lines = Array.from({ length: lineCount }, (_, i) =>
    i % 3 === 0
      ? `+  const value${i} = someFunction(arg${i}); // added line ${i}`
      : `-  const old${i} = legacyFn(arg${i}); // removed line ${i}`
  ).join("\n");

  return (
    `diff --git a/${path} b/${path}\n` +
    `index abc123..def456 100644\n` +
    `--- a/${path}\n` +
    `+++ b/${path}\n` +
    `@@ -1,${lineCount} +1,${lineCount} @@\n` +
    lines +
    "\n"
  );
}

// Vary sizes: small (10 lines), medium (100 lines), large (400 lines)
const syntheticDiff = Array.from({ length: 50 }, (_, i) => {
  const size = i % 5 === 0 ? 400 : i % 3 === 0 ? 100 : 10;
  return makeFakeFileDiff(i, size);
}).join("");

console.log(`Synthetic diff total length: ${syntheticDiff.length} chars (~${Math.ceil(syntheticDiff.length / 4)} tokens)\n`);

// ---------------------------------------------------------------------------
// Run chunkDiff
// ---------------------------------------------------------------------------

const MAX_TOKENS = 6000;
const chunks = chunkDiff(syntheticDiff, MAX_TOKENS);

console.log(`Chunk count: ${chunks.length}\n`);

let allUnderLimit = true;

for (let i = 0; i < chunks.length; i++) {
  const c = chunks[i];
  const over = c.estimatedTokens > MAX_TOKENS;
  if (over) allUnderLimit = false;

  console.log(
    `Chunk ${String(i + 1).padStart(2)}: ${c.files.length} file(s), ` +
    `~${c.estimatedTokens} tokens ${over ? "  *** EXCEEDS LIMIT ***" : ""}`
  );
  for (const f of c.files) {
    console.log(`         - ${f}`);
  }
}

console.log("\n--- Verification ---");
if (allUnderLimit) {
  console.log("PASS: all chunks are within the 6000-token limit.");
} else {
  console.error("FAIL: one or more chunks exceed the 6000-token limit.");
  process.exit(1);
}
