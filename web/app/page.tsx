export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full text-center space-y-6">
        <h1 className="text-4xl font-bold text-gray-900">Code Review Tool</h1>
        <p className="text-lg text-gray-600">
          A collaborative platform for reviewing pull requests and improving code quality.
        </p>
        <div className="flex gap-4 justify-center">
          <a
            href="/api/pull-requests"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            View Pull Requests
          </a>
        </div>
        <p className="text-sm text-gray-400">
          API running at{" "}
          <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">
            {process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}
          </code>
        </p>
      </div>
    </main>
  );
}
