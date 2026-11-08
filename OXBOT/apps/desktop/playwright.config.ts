import { defineConfig } from '@playwright/test';
// One Electron app at a time: they share port 8790 and the single-instance lock.
export default defineConfig({ testDir: './tests', workers: 1, timeout: 60_000, reporter: [['list']], use: { trace: 'retain-on-failure' } });
