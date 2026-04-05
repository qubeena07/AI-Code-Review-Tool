import { Queue } from "bullmq";
import IORedis from "ioredis";

export interface ReviewJobData {
  prNumber: number;
  repoFullName: string;
  diffUrl: string;
  userId: string;
}

export const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

export const reviewQueue = new Queue<ReviewJobData>("review-queue", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
});
