import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  expect: { timeout: 5000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${process.env.PORT || '3000'}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: 'npm start',
    url: process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${process.env.PORT || '3000'}`,
    // Keep deterministic runs: avoid attaching to unrelated local dev servers.
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      BROWSER: 'none',
      HOST: '127.0.0.1',
      PORT: process.env.PORT || '3000',
      REACT_APP_BACKEND_URL: '',
    },
  },
});
