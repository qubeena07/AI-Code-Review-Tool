import { Router, Request, Response } from "express";
import axios from "axios";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";

const router = Router();

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID!;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET!;
const GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL!;
const JWT_SECRET = process.env.JWT_SECRET!;
const WEB_URL = process.env.WEB_URL ?? "http://localhost:3000";

// ------------------------------------------------------------------
// GET /auth/github — kick off OAuth flow
// ------------------------------------------------------------------
router.get("/github", (_req: Request, res: Response) => {
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: GITHUB_CALLBACK_URL,
    scope: "repo read:user",
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

// ------------------------------------------------------------------
// GET /auth/github/callback — exchange code, upsert user, set cookie
// ------------------------------------------------------------------
router.get("/github/callback", async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined;

  if (!code) {
    res.status(400).json({ error: "Missing OAuth code" });
    return;
  }

  // 1. Exchange code for access token
  const tokenResponse = await axios.post<{ access_token?: string; error?: string }>(
    "https://github.com/login/oauth/access_token",
    {
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: GITHUB_CALLBACK_URL,
    },
    { headers: { Accept: "application/json" } }
  );

  const accessToken = tokenResponse.data.access_token;
  if (!accessToken) {
    res.status(401).json({ error: "GitHub token exchange failed", detail: tokenResponse.data.error });
    return;
  }

  // 2. Fetch GitHub user profile
  const { data: ghUser } = await axios.get<{
    id: number;
    login: string;
    avatar_url: string;
  }>("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
    },
  });

  // 3. Upsert user in Prisma
  const user = await prisma.user.upsert({
    where: { githubId: String(ghUser.id) },
    update: {
      login: ghUser.login,
      avatarUrl: ghUser.avatar_url,
      accessToken,
    },
    create: {
      githubId: String(ghUser.id),
      login: ghUser.login,
      avatarUrl: ghUser.avatar_url,
      accessToken,
    },
  });

  // 4. Sign JWT and set httpOnly cookie
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });

  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  });

  res.redirect(`${WEB_URL}/dashboard`);
});

// ------------------------------------------------------------------
// GET /auth/me — verify cookie, return user
// ------------------------------------------------------------------
router.get("/me", async (req: Request, res: Response) => {
  const token = req.cookies?.token as string | undefined;

  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  let payload: { userId: string };
  try {
    payload = jwt.verify(token, JWT_SECRET) as { userId: string };
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, login: true, avatarUrl: true, createdAt: true },
  });

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({ data: user });
});

// ------------------------------------------------------------------
// POST /auth/logout — clear cookie
// ------------------------------------------------------------------
router.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie("token", { httpOnly: true, sameSite: "lax" });
  res.status(200).json({ message: "Logged out" });
});

export default router;
