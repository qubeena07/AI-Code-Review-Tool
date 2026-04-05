import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import crypto from "crypto";

// Mock queue before app import
vi.mock("../src/queue/index", () => ({
  reviewQueue: { add: vi.fn() },
  connection: { on: vi.fn(), status: "ready" },
}));

// Prevent bull-board from wrapping the mocked queue
vi.mock("../src/queue/dashboard", () => {
  const { Router } = require("express");
  return { bullBoardRouter: Router() };
});

// Mock Prisma so no real DB connection is needed
vi.mock("../src/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findFirst: vi.fn() },
    repository: { findMany: vi.fn(), findFirst: vi.fn() },
  },
}));

// Import after mocks are in place
import app from "../src/index";
import { reviewQueue } from "../src/queue/index";

const WEBHOOK_SECRET = "test-webhook-secret";

function sign(body: string): string {
  return (
    "sha256=" +
    crypto.createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex")
  );
}

function prPayload(action: string) {
  return JSON.stringify({
    action,
    pull_request: {
      number: 42,
      title: "Add feature X",
      diff_url: "https://github.com/owner/repo/pull/42.diff",
      user: { login: "alice" },
    },
    repository: {
      full_name: "owner/repo",
      owner: { login: "owner" },
    },
  });
}

describe("POST /github/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  it("returns 200 and queues a job for a valid opened PR", async () => {
    const body = prPayload("opened");
    const sig = sign(body);

    const res = await request(app)
      .post("/github/webhook")
      .set("x-hub-signature-256", sig)
      .set("Content-Type", "application/json")
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true, queued: true });
    expect(reviewQueue.add).toHaveBeenCalledOnce();
  });

  it("returns 401 for an invalid signature", async () => {
    const body = prPayload("opened");

    const res = await request(app)
      .post("/github/webhook")
      .set("x-hub-signature-256", "sha256=deafbeef")
      .set("Content-Type", "application/json")
      .send(body);

    expect(res.status).toBe(401);
    expect(reviewQueue.add).not.toHaveBeenCalled();
  });

  it("returns 200 but does NOT queue a job for action 'closed'", async () => {
    const body = prPayload("closed");
    const sig = sign(body);

    const res = await request(app)
      .post("/github/webhook")
      .set("x-hub-signature-256", sig)
      .set("Content-Type", "application/json")
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true, queued: false });
    expect(reviewQueue.add).not.toHaveBeenCalled();
  });
});
