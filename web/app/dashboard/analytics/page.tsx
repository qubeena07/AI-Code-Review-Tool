"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  AreaChart,
  Area,
  CartesianGrid,
  Legend,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Summary {
  avgScore: number;
  totalReviews: number;
  totalSecurity: number;
  thisWeek: number;
}

interface ScorePoint {
  date: string;
  avg_score: number;
  count: number;
}

interface IssueType {
  type: string;
  severity: string;
  count: number;
}

interface VolumePoint {
  week: string;
  full_name: string;
  count: number;
}

interface LeaderboardEntry {
  author: string;
  avg_score: number;
  total_reviews: number;
}

interface AnalyticsData {
  summary: Summary;
  scoreTimeline: ScorePoint[];
  issueTypes: IssueType[];
  weeklyVolume: VolumePoint[];
  leaderboard: LeaderboardEntry[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REPO_COLORS = ["#378ADD", "#1D9E75", "#D85A30", "#7F77DD", "#888780"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function scoreBg(score: number) {
  if (score >= 8) return "bg-green-100 text-green-800";
  if (score >= 6) return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-800";
}

/**
 * Pivot weekly volume rows into chart-ready shape:
 * [{ week, repo1: n, repo2: n, ... }]
 * Repos beyond the top 5 by total count are merged into "Other".
 */
function pivotWeeklyVolume(rows: VolumePoint[]): {
  data: Record<string, string | number>[];
  repos: string[];
} {
  // Sum totals per repo
  const totals: Record<string, number> = {};
  for (const r of rows) {
    totals[r.full_name] = (totals[r.full_name] ?? 0) + r.count;
  }
  const sorted = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
  const top5 = sorted.slice(0, 5);
  const hasOther = sorted.length > 5;
  const repos = hasOther ? [...top5, "Other"] : top5;

  // Build week map
  const weeks: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    if (!weeks[r.week]) weeks[r.week] = {};
    const key = top5.includes(r.full_name) ? r.full_name : "Other";
    weeks[r.week][key] = (weeks[r.week][key] ?? 0) + r.count;
  }

  const data = Object.entries(weeks)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, counts]) => ({ week, ...counts }));

  return { data, repos };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">{title}</h2>
      {children}
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-3xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics")
      .then((r) => r.json())
      .then((json) => setData(json.data ?? null))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 text-white p-8 flex items-center justify-center">
        <span className="text-gray-500 text-sm">Loading analytics…</span>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-gray-950 text-white p-8 flex items-center justify-center">
        <span className="text-red-400 text-sm">Failed to load analytics.</span>
      </main>
    );
  }

  const { summary, scoreTimeline, issueTypes, weeklyVolume, leaderboard } = data;
  const { data: volumeData, repos: volumeRepos } = pivotWeeklyVolume(weeklyVolume);

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-gray-400 text-sm mt-0.5">Aggregate insights across all your code reviews</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Avg quality score"
            value={summary.avgScore ?? "—"}
            sub="out of 10"
          />
          <MetricCard
            label="Total PRs reviewed"
            value={summary.totalReviews.toLocaleString()}
          />
          <MetricCard
            label="Security issues found"
            value={summary.totalSecurity.toLocaleString()}
          />
          <MetricCard
            label="Reviews this week"
            value={summary.thisWeek.toLocaleString()}
          />
        </div>

        {/* Score timeline */}
        <Card title="Quality score over time">
          {scoreTimeline.length === 0 ? (
            <div className="h-60 flex items-center justify-center text-gray-600 text-sm">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={scoreTimeline} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  tick={{ fill: "#6b7280", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 10]}
                  tick={{ fill: "#6b7280", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", borderRadius: 8 }}
                  labelStyle={{ color: "#9ca3af" }}
                  itemStyle={{ color: "#378ADD" }}
                  labelFormatter={formatDate}
                />
                <Line
                  type="monotone"
                  dataKey="avg_score"
                  stroke="#378ADD"
                  strokeWidth={2}
                  dot={false}
                  name="Avg score"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Two-column row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top security issue types */}
          <Card title="Top security issue types">
            {issueTypes.length === 0 ? (
              <div className="h-[280px] flex items-center justify-center text-gray-600 text-sm">No data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  layout="vertical"
                  data={issueTypes}
                  margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="type"
                    width={140}
                    tick={{ fill: "#9ca3af", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", borderRadius: 8 }}
                    labelStyle={{ color: "#9ca3af" }}
                    itemStyle={{ color: "#E24B4A" }}
                  />
                  <Bar dataKey="count" fill="#E24B4A" radius={[0, 4, 4, 0]} name="Count" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* Review volume by week */}
          <Card title="Review volume by week">
            {volumeData.length === 0 ? (
              <div className="h-[280px] flex items-center justify-center text-gray-600 text-sm">No data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={volumeData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis
                    dataKey="week"
                    tickFormatter={formatDate}
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", borderRadius: 8 }}
                    labelStyle={{ color: "#9ca3af" }}
                    labelFormatter={formatDate}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11, color: "#9ca3af" }}
                    formatter={(v) => v.length > 20 ? v.slice(v.indexOf("/") + 1) : v}
                  />
                  {volumeRepos.map((repo, i) => (
                    <Area
                      key={repo}
                      type="monotone"
                      dataKey={repo}
                      stackId="1"
                      stroke={REPO_COLORS[i % REPO_COLORS.length]}
                      fill={REPO_COLORS[i % REPO_COLORS.length]}
                      fillOpacity={0.6}
                      name={repo}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>

        {/* Leaderboard */}
        <Card title="Author leaderboard">
          {leaderboard.length === 0 ? (
            <div className="py-8 text-center text-gray-600 text-sm">No data yet</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800">
                  <th className="text-left pb-2 font-medium w-12">Rank</th>
                  <th className="text-left pb-2 font-medium">Author</th>
                  <th className="text-left pb-2 font-medium">Avg Score</th>
                  <th className="text-left pb-2 font-medium">Total Reviews</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {leaderboard.map((entry, i) => (
                  <tr key={entry.author} className="hover:bg-gray-800/40 transition-colors">
                    <td className="py-3 text-gray-500 font-medium">#{i + 1}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <img
                          src={`https://github.com/${entry.author}.png?size=48`}
                          alt={entry.author}
                          className="w-6 h-6 rounded-full"
                        />
                        <span className="text-white">{entry.author}</span>
                      </div>
                    </td>
                    <td className="py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${scoreBg(entry.avg_score)}`}>
                        {entry.avg_score}/10
                      </span>
                    </td>
                    <td className="py-3 text-gray-300">{entry.total_reviews}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </main>
  );
}
