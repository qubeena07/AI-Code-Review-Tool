import axios from "axios";
import { Resend } from "resend";
import type { ReviewResult } from "@code-review-tool/types";

// ─── Slack ────────────────────────────────────────────────────────────────────

function scoreEmoji(score: number): string {
  if (score >= 8) return "🟢";
  if (score >= 6) return "🟡";
  return "🔴";
}

export async function sendSlackNotification(
  webhookUrl: string,
  review: ReviewResult,
  prUrl: string,
  prTitle: string
): Promise<void> {
  try {
    const criticalOrHigh = review.securityIssues.filter(
      (i) => i.severity === "CRITICAL" || i.severity === "HIGH"
    );

    const blocks: object[] = [
      {
        type: "header",
        text: { type: "plain_text", text: "AI Code Review Complete", emoji: true },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*<${prUrl}|${prTitle}>*`,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `${scoreEmoji(review.qualityScore)} *Score:* ${review.qualityScore}/10`,
          },
          {
            type: "mrkdwn",
            text: `*Suggestions:* ${review.suggestions.length}`,
          },
          {
            type: "mrkdwn",
            text: `*Security Issues:* ${review.securityIssues.length}`,
          },
        ],
      },
    ];

    if (criticalOrHigh.length > 0) {
      const issueLines = criticalOrHigh
        .map((i) => `• \`[${i.type}]\` in ${i.filePath}`)
        .join("\n");
      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `*Critical/High Issues:*\n${issueLines}`,
          },
        ],
      });
    }

    await axios.post(webhookUrl, { blocks });
  } catch (err) {
    console.error("[notifications] Slack notification failed:", err);
  }
}

// ─── Email ────────────────────────────────────────────────────────────────────

function scoreBadgeStyle(score: number): string {
  if (score >= 8) return "background:#22c55e;color:#fff";
  if (score >= 6) return "background:#eab308;color:#fff";
  return "background:#ef4444;color:#fff";
}

function buildEmailHtml(review: ReviewResult, prUrl: string, prTitle: string): string {
  const badgeStyle = scoreBadgeStyle(review.qualityScore);
  const topSuggestions = review.suggestions.slice(0, 3);
  const securityCount = review.securityIssues.length;

  const suggestionRows = topSuggestions
    .map(
      (s) => `
      <tr>
        <td style="padding:6px 8px;border:1px solid #e5e7eb">${s.severity}</td>
        <td style="padding:6px 8px;border:1px solid #e5e7eb;font-family:monospace;font-size:12px">${s.filePath}</td>
        <td style="padding:6px 8px;border:1px solid #e5e7eb">${s.body}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#111">
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
    <h2 style="margin:0">${prTitle}</h2>
    <span style="padding:4px 10px;border-radius:999px;font-weight:bold;font-size:14px;${badgeStyle}">
      ${review.qualityScore}/10
    </span>
  </div>

  <p style="color:#374151">${review.summary}</p>

  ${
    topSuggestions.length > 0
      ? `<h3 style="margin-top:24px">Top Suggestions</h3>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <thead>
      <tr style="background:#f9fafb">
        <th style="padding:6px 8px;border:1px solid #e5e7eb;text-align:left">Severity</th>
        <th style="padding:6px 8px;border:1px solid #e5e7eb;text-align:left">File</th>
        <th style="padding:6px 8px;border:1px solid #e5e7eb;text-align:left">Description</th>
      </tr>
    </thead>
    <tbody>${suggestionRows}</tbody>
  </table>`
      : ""
  }

  <p style="margin-top:20px">
    <strong style="${securityCount > 0 ? "color:#ef4444" : ""}">
      Security Issues: ${securityCount}
    </strong>
  </p>

  <a href="${prUrl}"
     style="display:inline-block;margin-top:16px;padding:10px 20px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">
    View on GitHub
  </a>
</body>
</html>`;
}

export async function sendEmailNotification(
  toEmail: string,
  review: ReviewResult,
  prUrl: string,
  prTitle: string
): Promise<void> {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: "reviews@yourdomain.com",
      to: toEmail,
      subject: `[CodeReview AI] PR reviewed — Score ${review.qualityScore}/10`,
      html: buildEmailHtml(review, prUrl, prTitle),
    });
  } catch (err) {
    console.error("[notifications] Email notification failed:", err);
  }
}
