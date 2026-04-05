import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ReviewResult } from "@code-review-tool/types";
import { REVIEW_SYSTEM_PROMPT } from "./prompts";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function reviewCode(diffChunk: string): Promise<ReviewResult> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: REVIEW_SYSTEM_PROMPT,
  });

  const response = await model.generateContent(
    "Review this pull request diff:\n\n" + diffChunk
  );

  const text = response.response.text();

  // Strip markdown code fences if the model wraps output anyway
  const cleaned = text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();

  let result: ReviewResult;
  try {
    result = JSON.parse(cleaned) as ReviewResult;
  } catch {
    console.error("[llm] Raw LLM output that failed to parse:\n", text);
    throw new Error("LLM returned invalid JSON");
  }

  return result;
}
