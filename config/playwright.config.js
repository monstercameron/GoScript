// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: '../tests',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    timeout: 180000,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: [['list'], ['html', { open: 'never' }]],
    
    use: {
        baseURL: 'http://127.0.0.1:4173',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: {
        command: 'npm run build && npx serve -l 4173 .',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: false,
        timeout: 180000
    }
});
