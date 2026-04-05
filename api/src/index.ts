import express, { Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

dotenv.config();

import { bullBoardRouter } from "./queue/dashboard";
import authRouter from "./routes/auth";
import webhookRouter from "./routes/webhook";
import reposRouter from "./routes/repos";

const app = express();
const PORT = process.env.PORT ?? 4000;

app.use(cors({ origin: process.env.WEB_URL ?? "http://localhost:3000", credentials: true }));

// Webhook must be mounted BEFORE express.json() so it can read the raw body
app.use("/", webhookRouter);

app.use(express.json());
app.use(cookieParser());

app.use("/admin/queues", bullBoardRouter);
app.use("/auth", authRouter);
app.use("/repos", reposRouter);

app.get("/", (_req: Request, res: Response) => {
  res.json({ message: "Code Review Tool API", status: "ok" });
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Pull requests routes placeholder
app.get("/api/pull-requests", (_req: Request, res: Response) => {
  res.json({ data: [], total: 0, page: 1, pageSize: 20 });
});

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});

export default app;
