// Set env vars before any module is imported
process.env.WEBHOOK_SECRET = "test-webhook-secret";
process.env.JWT_SECRET = "test-jwt-secret";
process.env.GEMINI_API_KEY = "test-gemini-key";
process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/codereview_test";
