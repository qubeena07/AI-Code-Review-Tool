import { describe, it, expect, vi, beforeEach } from "vitest";

const validResult = {
  qualityScore: 7,
  summary: "Good code overall.",
  suggestions: [],
  securityIssues: [],
  positives: ["Clean structure"],
};

// Mock the Gemini SDK before importing the module under test.
// Must use a real class so `new GoogleGenerativeAI(...)` works as a constructor.
vi.mock("@google/generative-ai", () => {
  const generateContent = vi.fn().mockResolvedValue({
    response: { text: () => JSON.stringify(validResult) },
  });

  class GoogleGenerativeAI {
    getGenerativeModel() {
      return { generateContent };
    }
  }

  return { GoogleGenerativeAI, _generateContent: generateContent };
});

// Import AFTER the mock is registered
import { reviewCode } from "../src/services/llm";

describe("reviewCode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves to a valid ReviewResult when the model returns well-formed JSON", async () => {
    const result = await reviewCode("fake diff content");

    expect(result.qualityScore).toBe(7);
    expect(result.summary).toBe("Good code overall.");
    expect(result.suggestions).toEqual([]);
    expect(result.securityIssues).toEqual([]);
    expect(result.positives).toContain("Clean structure");
  });

  it("throws 'LLM returned invalid JSON' when the model returns malformed output", async () => {
    // Reach into the shared generateContent mock and override it for this call
    const { _generateContent } = await import("@google/generative-ai") as unknown as {
      _generateContent: ReturnType<typeof vi.fn>;
    };
    _generateContent.mockResolvedValueOnce({
      response: { text: () => "this is not json {{{" },
    });

    await expect(reviewCode("fake diff")).rejects.toThrow("LLM returned invalid JSON");
  });
});
