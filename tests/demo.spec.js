// @ts-check
const { test, expect } = require('@playwright/test');

async function getEditorValue(page) {
    return page.evaluate(() => {
        // @ts-ignore
        return document.querySelector('.CodeMirror').CodeMirror.getValue();
    });
}

async function setEditorValue(page, value) {
    await page.evaluate((source) => {
        // @ts-ignore
        document.querySelector('.CodeMirror').CodeMirror.setValue(source);
    }, value);
}

async function runExample(page, example) {
    await page.locator('#examples').selectOption(example);
    await page.locator('#btn-run').click();
}

test.describe('GoScript Demo Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/docs/local.index.html');
    });

    test('page loads correctly', async ({ page }) => {
        await expect(page).toHaveTitle('GoScript - Go in the Browser');
        await expect(page.locator('h1')).toContainText('GoScript');
        await expect(page.locator('p.text-gray-500')).toContainText('Browser-based Go compiler');
    });

    test('UI elements are present', async ({ page }) => {
        await expect(page.locator('#btn-run')).toBeVisible();
        await expect(page.locator('#btn-clear')).toBeVisible();
        await expect(page.locator('.CodeMirror')).toBeVisible();
        await expect(page.locator('#output')).toBeVisible();
        await expect(page.locator('#examples')).toBeVisible();
    });

    test('default code is present', async ({ page }) => {
        const value = await getEditorValue(page);

        expect(value).toContain('package main');
        expect(value).toContain('import "fmt"');
        expect(value).toContain('fmt.Println');
    });

    test('GoScript SDK initializes locally', async ({ page }) => {
        await expect(page.locator('#status-text')).toHaveText('Ready', {
            timeout: 180000
        });

        await expect(page.locator('#btn-run')).toBeEnabled();
    });

    test('example programs load correctly', async ({ page }) => {
        const examples = ['hello', 'fibonacci', 'fizzbuzz', 'primes', 'structs'];

        for (const example of examples) {
            await page.locator('#examples').selectOption(example);
            const source = await getEditorValue(page);
            expect(source).toContain('package main');
            expect(source.length).toBeGreaterThan(50);
        }
    });

    test('clear button works', async ({ page }) => {
        await page.locator('#output').evaluate((el) => {
            el.textContent = 'Test output';
        });

        await page.locator('#btn-clear').click();
        await expect(page.locator('#output')).toHaveText('');
    });

    test.describe('with initialized SDK', () => {
        test.beforeEach(async ({ page }) => {
            await expect(page.locator('#status-text')).toHaveText('Ready', {
                timeout: 180000
            });
        });

        test('compiles and runs Hello World with real execution output', async ({ page }) => {
            await runExample(page, 'hello');

            await expect(page.locator('#status-text')).toHaveText('Complete', {
                timeout: 120000
            });

            const output = await page.locator('#output').textContent();
            const wasmSizeText = await page.locator('#wasm-size').textContent();
            const wasmSizeKb = parseFloat((wasmSizeText || '0').replace('KB', '').trim());

            expect(output).toContain('Hello, World!');
            expect(output).toContain('Welcome to GoScript - Go in your browser!');
            expect(output).not.toContain('Mock execution');
            expect(wasmSizeKb).toBeGreaterThan(10);
        });

        test('compiles and runs Fibonacci with expected stdout', async ({ page }) => {
            await runExample(page, 'fibonacci');

            await expect(page.locator('#status-text')).toHaveText('Complete', {
                timeout: 120000
            });

            const output = await page.locator('#output').textContent();
            expect(output).toContain('Fibonacci Sequence:');
            expect(output).toContain('fib(10) = 55');
            expect(output).toContain('fib(14) = 377');
        });

        test('supports consecutive compile and run cycles in the same page session', async ({ page }) => {
            await runExample(page, 'hello');

            await expect(page.locator('#status-text')).toHaveText('Complete', {
                timeout: 120000
            });
            await expect(page.locator('#output')).toContainText('Hello, World!');

            await runExample(page, 'fibonacci');

            await expect(page.locator('#status-text')).toHaveText('Complete', {
                timeout: 120000
            });
            await expect(page.locator('#output')).toContainText('fib(14) = 377');
        });

        test('shows compile time and a non-trivial wasm size', async ({ page }) => {
            await runExample(page, 'hello');

            await expect(page.locator('#status-text')).toHaveText('Complete', {
                timeout: 120000
            });

            const compileTime = await page.locator('#compile-time').textContent();
            const wasmSize = await page.locator('#wasm-size').textContent();
            const wasmSizeKb = parseFloat((wasmSize || '0').replace('KB', '').trim());

            expect(compileTime).toMatch(/\d+ms/);
            expect(wasmSize).toMatch(/[\d.]+ KB/);
            expect(wasmSizeKb).toBeGreaterThan(10);
        });

        test('invalid Go code fails compilation instead of reporting success', async ({ page }) => {
            await setEditorValue(page, `package main

func main() {
    invalidSyntax here!!!
}`);

            await page.locator('#btn-run').click();

            await expect(page.locator('#status-text')).toHaveText('Compilation failed', {
                timeout: 120000
            });

            const output = await page.locator('#output').textContent();
            expect(output).toMatch(/error|syntax|invalid|expected/i);
        });

        test('tiny fake wasm is rejected in production execution mode', async ({ page }) => {
            const result = await page.evaluate(async () => {
                const runner = new AppRunner();
                await runner.init();

                try {
                    await runner.executeConsole(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]).buffer, 'package main');
                    return { ok: true, error: null };
                } catch (error) {
                    return { ok: false, error: error.message };
                }
            });

            expect(result.ok).toBeFalsy();
            expect(result.error).toMatch(/disabled/i);
        });

        test('Ctrl+Enter shortcut runs code', async ({ page }) => {
            await page.locator('#examples').selectOption('hello');
            await page.locator('.CodeMirror').click();
            await page.keyboard.press('Control+Enter');

            await expect(page.locator('#status-text')).toHaveText('Complete', {
                timeout: 120000
            });

            const output = await page.locator('#output').textContent();
            expect(output).toContain('Hello, World!');
        });
    });
});
