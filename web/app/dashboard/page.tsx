"use client";

import { useAuth } from "@/contexts/AuthContext";

export default function DashboardPage() {
  const { user, logout } = useAuth();

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          {user && (
            <p className="text-gray-400 mt-1">
              Signed in as{" "}
              <span className="text-white font-medium">{user.login}</span>
            </p>
          )}
        </div>
        <button
          onClick={logout}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors"
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
