import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      PORT: '3000',
      MONGO_URL: 'mongodb://localhost:27017/test',
      LOG_LEVEL: 'silent',
    },
  },
});
