"use client";

import { useEffect, useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SecurityIssue {
  id: string;
  type: string;
  severity: string;
  filePath: string;
  lineNumber: number;
  description: string;
  recommendation: string;
}

interface Comment {
  id: string;
  filePath: string;
  lineNumber: number;
  body: string;
  severity: string;
}

interface Repository {
  id: string;
  fullName: string;
}

interface PullRequest {
  id: string;
  title: string;
  author: string;
  number: number;
  repository: Repository;
}

interface Review {
  id: string;
  qualityScore: number;
  summary: string;
  createdAt: string;
  pullRequest: PullRequest;
  comments: Comment[];
  securityIssues: SecurityIssue[];
}

interface Filters {
  dateRange: "7d" | "30d" | "all";
  score: "all" | "good" | "okay" | "poor";
  hasSecurityIssues: boolean;
  repoId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

function scoreBg(score: number) {
  if (score >= 8) return "bg-green-100 text-green-800";
  if (score >= 6) return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-800";
}

function avatarUrl(login: string) {
  return `https://github.com/${login}.png?size=48`;
}

function filtersToParams(filters: Filters, page: number): string {
  const p = new URLSearchParams({ page: String(page) });
  if (filters.dateRange !== "all") p.set("dateRange", filters.dateRange);
  if (filters.score === "good") { p.set("scoreMin", "8"); }
  if (filters.score === "okay") { p.set("scoreMin", "6"); p.set("scoreMax", "7"); }
  if (filters.score === "poor") { p.set("scoreMax", "5"); }
  if (filters.hasSecurityIssues) p.set("hasSecurityIssues", "true");
  if (filters.repoId) p.set("repoId", filters.repoId);
  return p.toString();
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function DetailPanel({ review, onClose }: { review: Review; onClose: () => void }) {
  const pr = review.pullRequest;
  const prUrl = `https://github.com/${pr.repository.fullName}/pull/${pr.number}`;

  const byFile = review.comments.reduce<Record<string, Comment[]>>((acc, c) => {
    (acc[c.filePath] ??= []).push(c);
    return acc;
  }, {});

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-full max-w-[480px] bg-gray-900 border-l border-gray-800 z-50 overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-6 border-b border-gray-800 sticky top-0 bg-gray-900">
          <div className="min-w-0">
            <div className="text-xs text-gray-500 mb-1">{pr.repository.fullName}</div>
            <h2 className="font-semibold text-white text-sm leading-snug">{pr.title}</h2>
            <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400">
              <img src={avatarUrl(pr.author)} alt={pr.author} className="w-4 h-4 rounded-full" />
              {pr.author} · {relativeTime(review.createdAt)}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white shrink-0 mt-0.5">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6 flex-1">
          {/* Score */}
          <div className="flex items-center gap-3">
            <span className={`text-3xl font-bold px-4 py-2 rounded-xl ${scoreBg(review.qualityScore)}`}>
              {review.qualityScore}/10
            </span>
            <a
              href={prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-indigo-400 hover:text-indigo-300 underline"
            >
              View PR on GitHub ↗
            </a>
          </div>

          {/* Summary */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Summary</h3>
            <p className="text-sm text-gray-300 leading-relaxed">{review.summary}</p>
          </div>

          {/* Suggestions */}
          {review.comments.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Suggestions ({review.comments.length})
              </h3>
              <div className="space-y-4">
                {Object.entries(byFile).map(([file, comments]) => (
                  <div key={file}>
                    <div className="text-xs font-mono text-indigo-400 mb-2">{file}</div>
                    <div className="space-y-2">
                      {comments.map((c) => (
                        <div key={c.id} className="flex gap-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${
                            c.severity === "WARNING"
                              ? "bg-yellow-900 text-yellow-300"
                              : "bg-blue-900 text-blue-300"
                          }`}>
                            {c.severity}
                          </span>
                          <p className="text-sm text-gray-300">{c.body}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Security Issues */}
          {review.securityIssues.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Security Issues ({review.securityIssues.length})
              </h3>
              <div className="space-y-3">
                {review.securityIssues.map((issue) => (
                  <div key={issue.id} className="bg-gray-800 rounded-lg p-3 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        issue.severity === "CRITICAL" ? "bg-red-900 text-red-300" :
                        issue.severity === "HIGH" ? "bg-orange-900 text-orange-300" :
                        issue.severity === "MEDIUM" ? "bg-yellow-900 text-yellow-300" :
                        "bg-gray-700 text-gray-300"
                      }`}>
                        {issue.severity}
                      </span>
                      <span className="text-sm font-medium text-white">{issue.type}</span>
                    </div>
                    <div className="text-xs font-mono text-gray-400">
                      {issue.filePath}:{issue.lineNumber}
                    </div>
                    <p className="text-sm text-gray-300">{issue.description}</p>
                    <div className="bg-gray-900 rounded p-2 text-xs text-green-400">
                      <span className="text-gray-500">Fix: </span>{issue.recommendation}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const DEFAULT_FILTERS: Filters = {
  dateRange: "all",
  score: "all",
  hasSecurityIssues: false,
  repoId: "",
};

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<Review | null>(null);

  const fetchReviews = useCallback(async (f: Filters, p: number) => {
    setLoading(true);
    try {
      const params = filtersToParams(f, p);
      const res = await fetch(`/api/reviews?${params}`);
      const json = await res.json();
      setReviews(json.data?.reviews ?? []);
      setTotal(json.data?.total ?? 0);
      setTotalPages(json.data?.totalPages ?? 1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReviews(filters, page);
  }, [filters, page, fetchReviews]);

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setPage(1);
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function exportCsv() {
    const params = filtersToParams(filters, 1);
    window.location.href = `/api/reviews/export?${params}`;
  }

  const from = total === 0 ? 0 : (page - 1) * 20 + 1;
  const to = Math.min(page * 20, total);

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-6xl mx-auto">
        {/* Title row */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Reviews</h1>
            <p className="text-gray-400 text-sm mt-0.5">AI code review history across all repositories</p>
          </div>
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3 mb-5 p-4 bg-gray-900 rounded-xl border border-gray-800">
          {/* Date range */}
          <div className="flex rounded-lg overflow-hidden border border-gray-700 text-sm">
            {(["7d", "30d", "all"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setFilter("dateRange", v)}
                className={`px-3 py-1.5 transition-colors ${
                  filters.dateRange === v
                    ? "bg-indigo-600 text-white"
                    : "text-gray-400 hover:text-white hover:bg-gray-800"
                }`}
              >
                {v === "7d" ? "7 days" : v === "30d" ? "30 days" : "All time"}
              </button>
            ))}
          </div>

          {/* Score filter */}
          <div className="flex rounded-lg overflow-hidden border border-gray-700 text-sm">
            {([
              { value: "all", label: "All" },
              { value: "good", label: "Good ≥8" },
              { value: "okay", label: "Okay 6–7" },
              { value: "poor", label: "Poor <6" },
            ] as const).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setFilter("score", value)}
                className={`px-3 py-1.5 transition-colors ${
                  filters.score === value
                    ? "bg-indigo-600 text-white"
                    : "text-gray-400 hover:text-white hover:bg-gray-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Security issues checkbox */}
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filters.hasSecurityIssues}
              onChange={(e) => setFilter("hasSecurityIssues", e.target.checked)}
              className="accent-indigo-600 w-4 h-4"
            />
            Has security issues only
          </label>
        </div>

        {/* Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-gray-500 text-sm">Loading…</div>
          ) : reviews.length === 0 ? (
            <div className="py-16 text-center text-gray-500 text-sm">No reviews found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-medium">PR</th>
                  <th className="text-left px-4 py-3 font-medium">Repo</th>
                  <th className="text-left px-4 py-3 font-medium">Author</th>
                  <th className="text-left px-4 py-3 font-medium">Score</th>
                  <th className="text-left px-4 py-3 font-medium">Security</th>
                  <th className="text-left px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {reviews.map((review) => {
                  const pr = review.pullRequest;
                  const prUrl = `https://github.com/${pr.repository.fullName}/pull/${pr.number}`;
                  return (
                    <tr
                      key={review.id}
                      onClick={() => setSelected(review)}
                      className="hover:bg-gray-800/60 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 text-white font-medium max-w-[220px]">
                        {truncate(pr.title, 50)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="bg-gray-800 text-gray-300 text-xs px-2 py-0.5 rounded-full whitespace-nowrap">
                          {pr.repository.fullName}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <img
                            src={avatarUrl(pr.author)}
                            alt={pr.author}
                            className="w-6 h-6 rounded-full"
                          />
                          <span className="text-gray-300">{pr.author}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${scoreBg(review.qualityScore)}`}>
                          {review.qualityScore}/10
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {review.securityIssues.length > 0 ? (
                          <span className="bg-red-100 text-red-800 text-xs font-semibold px-2 py-0.5 rounded-full">
                            {review.securityIssues.length}
                          </span>
                        ) : (
                          <span className="bg-gray-800 text-gray-400 text-xs px-2 py-0.5 rounded-full">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                        {relativeTime(review.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={prUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-gray-500 hover:text-indigo-400 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && total > 0 && (
          <div className="flex items-center justify-between mt-4 text-sm text-gray-400">
            <span>Showing {from}–{to} of {total} reviews</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={page <= 1}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selected && (
        <DetailPanel review={selected} onClose={() => setSelected(null)} />
      )}
    </main>
  );
}
