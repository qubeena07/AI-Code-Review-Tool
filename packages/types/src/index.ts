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
