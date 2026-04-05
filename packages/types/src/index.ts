// Shared TypeScript interfaces for the code-review-tool monorepo

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface Repository {
  id: string;
  name: string;
  owner: string;
  url: string;
  createdAt: string;
}

export interface PullRequest {
  id: string;
  repositoryId: string;
  title: string;
  description: string;
  authorId: string;
  status: "open" | "closed" | "merged";
  createdAt: string;
  updatedAt: string;
}

export interface Review {
  id: string;
  pullRequestId: string;
  reviewerId: string;
  status: "pending" | "approved" | "changes_requested";
  comments: ReviewComment[];
  createdAt: string;
  updatedAt: string;
}

export interface ReviewComment {
  id: string;
  reviewId: string;
  filePath: string;
  lineNumber: number;
  body: string;
  authorId: string;
  createdAt: string;
}

export interface ChangedFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string;
}

export interface PRData {
  title: string;
  author: string;
  baseBranch: string;
  headBranch: string;
  body: string;
  diff: string;
  changedFiles: ChangedFile[];
}

export interface DiffChunk {
  files: string[];
  diffChunk: string;
  estimatedTokens: number;
}

export interface ReviewSuggestion {
  filePath: string;
  lineNumber: number;
  severity: "SUGGESTION" | "WARNING";
  body: string;
}

export interface ReviewSecurityIssue {
  filePath: string;
  lineNumber: number;
  type: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description: string;
  recommendation: string;
}

export interface ReviewResult {
  qualityScore: number;
  summary: string;
  suggestions: ReviewSuggestion[];
  securityIssues: ReviewSecurityIssue[];
  positives: string[];
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  pageSize: number;
}
