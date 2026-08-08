import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      PORT: '3000',
      MONGO_URL: 'mongodb://localhost:27017/test',
      LOG_LEVEL: 'silent',
      JWT_SECRET: 'test-secret-at-least-16-chars',
      ADMIN_PASSWORD: 'test-password',
      // Well below the 80MB production default so the 413 tests can exceed it
      // without building an 80MB payload, but still above the >16MB blob the
      // GridFS integration test stores.
      MAX_UPLOAD_BYTES: String(24 * 1024 * 1024),
    },
  },
});
