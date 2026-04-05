"use client";

import { useEffect, useState } from "react";

interface Repo {
  fullName: string;
  private: boolean;
  stargazersCount: number;
  language: string | null;
  enabled: boolean;
  slackWebhookUrl: string;
  notificationEmail: string;
}

function GlobeIcon() {
  return (
    <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" strokeWidth="2" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" strokeWidth="2" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900 ${
        enabled ? "bg-indigo-600" : "bg-gray-700"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          enabled ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function SettingsPanel({
  repo,
  onSave,
}: {
  repo: Repo;
  onSave: (fullName: string, notificationEmail: string, slackWebhookUrl: string) => Promise<void>;
}) {
  const [email, setEmail] = useState(repo.notificationEmail);
  const [slack, setSlack] = useState(repo.slackWebhookUrl);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave(repo.fullName, email, slack);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-800 grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label className="block text-xs text-gray-400 mb-1">Notification email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Slack webhook URL</label>
        <input
          type="url"
          value={slack}
          onChange={(e) => setSlack(e.target.value)}
          placeholder="https://hooks.slack.com/services/..."
          className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
      <div className="sm:col-span-2 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-md transition-colors"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-sm text-green-400">Saved!</span>}
      </div>
    </div>
  );
}

export default function ReposPage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/repos/available")
      .then((r) => r.json())
      .then((json) => setRepos(json.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = repos.filter((r) =>
    r.fullName.toLowerCase().includes(search.toLowerCase())
  );

  async function handleToggle(fullName: string, enable: boolean) {
    // Optimistic update
    setRepos((prev) =>
      prev.map((r) => (r.fullName === fullName ? { ...r, enabled: enable } : r))
    );
    setExpanded((prev) => {
      const next = new Set(prev);
      if (enable) next.add(fullName);
      else next.delete(fullName);
      return next;
    });

    try {
      if (enable) {
        const res = await fetch("/api/repos/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fullName }),
        });
        if (!res.ok) throw new Error(await res.text());
      } else {
        const res = await fetch("/api/repos/disable", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fullName }),
        });
        if (!res.ok) throw new Error(await res.text());
      }
    } catch (err) {
      console.error("Toggle failed:", err);
      // Revert
      setRepos((prev) =>
        prev.map((r) => (r.fullName === fullName ? { ...r, enabled: !enable } : r))
      );
    }
  }

  async function handleSaveSettings(
    fullName: string,
    notificationEmail: string,
    slackWebhookUrl: string
  ) {
    try {
      const res = await fetch("/api/repos/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, notificationEmail, slackWebhookUrl }),
      });
      if (!res.ok) throw new Error(await res.text());
      setRepos((prev) =>
        prev.map((r) =>
          r.fullName === fullName ? { ...r, notificationEmail, slackWebhookUrl } : r
        )
      );
    } catch (err) {
      console.error("Save settings failed:", err);
    }
  }

  function toggleExpanded(fullName: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(fullName)) next.delete(fullName);
      else next.add(fullName);
      return next;
    });
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-1">Repositories</h1>
        <p className="text-gray-400 text-sm mb-6">
          Enable a repo to start receiving AI code reviews on pull requests.
        </p>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter repositories…"
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
        />

        {loading ? (
          <div className="text-gray-500 text-sm py-12 text-center">Loading repositories…</div>
        ) : filtered.length === 0 ? (
          <div className="text-gray-500 text-sm py-12 text-center">No repositories found.</div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((repo) => (
              <li
                key={repo.fullName}
                className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4"
              >
                <div className="flex items-center gap-3">
                  {repo.private ? <LockIcon /> : <GlobeIcon />}

                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => repo.enabled && toggleExpanded(repo.fullName)}
                      className="font-medium text-sm text-white truncate hover:text-indigo-400 transition-colors text-left"
                    >
                      {repo.fullName}
                    </button>
                    <div className="flex items-center gap-2 mt-0.5">
                      {repo.language && (
                        <span className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded-full">
                          {repo.language}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <StarIcon />
                        {repo.stargazersCount.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <Toggle
                    enabled={repo.enabled}
                    onChange={(v) => handleToggle(repo.fullName, v)}
                  />
                </div>

                {repo.enabled && expanded.has(repo.fullName) && (
                  <SettingsPanel repo={repo} onSave={handleSaveSettings} />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
