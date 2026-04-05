import { GoogleGenerativeAI, GoogleGenerativeAIError } from "@google/generative-ai";
import type { ReviewResult } from "@code-review-tool/types";
import { REVIEW_SYSTEM_PROMPT } from "./prompts";
import { logger } from "../middleware/logger";

export async function reviewCode(diffChunk: string): Promise<ReviewResult> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  try {
    const result = await model.generateContent([
      { text: REVIEW_SYSTEM_PROMPT },
      { text: "Review this pull request diff:\n\n" + diffChunk },
    ]);

    const text = result.response.text();
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    try {
      return JSON.parse(cleaned) as ReviewResult;
    } catch {
      logger.error({ rawOutput: text }, "LLM returned invalid JSON");
      throw new Error("LLM returned invalid JSON");
    }
  } catch (err) {
    if (err instanceof GoogleGenerativeAIError) {
      // Gemini quota exceeded (429) — signal worker to delay and retry
      if (err.message.includes("429") || err.message.includes("quota")) {
        const retryAfter = 60_000;
        logger.warn({ retryAfter }, "Gemini quota exceeded, will retry after delay");
        throw Object.assign(new Error("GEMINI_QUOTA_EXCEEDED"), { retryAfter });
      }

      // Safety block — Gemini refused the content
      if (err.message.includes("SAFETY")) {
        logger.warn("Gemini blocked content due to safety filters — returning default review");
        return {
          qualityScore: 5,
          summary: "Review unavailable: content filtered.",
          suggestions: [],
          securityIssues: [],
          positives: [],
        };
      }
    }

    // Re-throw if it's already our quota error
    if ((err as Error).message === "GEMINI_QUOTA_EXCEEDED") throw err;

    logger.error({ err }, "Gemini API error");
    throw new Error("LLM review failed: " + (err as Error).message);
  }
}
