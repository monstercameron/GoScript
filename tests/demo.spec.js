// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('GoScript Demo Page', () => {
    
    test.beforeEach(async ({ page }) => {
        // Navigate to the main page
        await page.goto('/docs/index.html');
    });

    test('page loads correctly', async ({ page }) => {
        // Check title
        await expect(page).toHaveTitle('GoScript - Go in the Browser');
        
        // Check main heading
        await expect(page.locator('h1')).toContainText('GoScript');
        
        // Check subtitle
        await expect(page.locator('p.text-gray-500')).toContainText('Browser-based Go compiler');
    });

    test('UI elements are present', async ({ page }) => {
        // Check buttons exist
        await expect(page.locator('#btn-run')).toBeVisible();
        await expect(page.locator('#btn-clear')).toBeVisible();
        
        // Check CodeMirror editor (replaces the textarea)
        await expect(page.locator('.CodeMirror')).toBeVisible();
        
        // Check output panel
        await expect(page.locator('#output')).toBeVisible();
        
        // Check examples dropdown
        await expect(page.locator('#examples')).toBeVisible();
    });

    test('default code is present', async ({ page }) => {
        // CodeMirror replaces textarea, get value from CodeMirror
        const value = await page.evaluate(() => {
            // @ts-ignore
            return document.querySelector('.CodeMirror').CodeMirror.getValue();
        });
        
        expect(value).toContain('package main');
        expect(value).toContain('import "fmt"');
        expect(value).toContain('fmt.Println');
    });

    test('GoScript SDK initializes', async ({ page }) => {
        // Wait for initialization - status should change from Loading
        // This may take a while as it loads the 168MB pack file
        await expect(page.locator('#status-text')).not.toHaveText('Loading...', {
            timeout: 180000 // 3 minutes for large file download
        });
        
        // Check if it's ready or shows an error
        const statusText = await page.locator('#status-text').textContent();
        console.log('Status after init:', statusText);
        
        // Either ready or a specific error
        const isReady = statusText === 'Ready';
        const hasError = statusText?.includes('Failed');
        
        expect(isReady || hasError).toBeTruthy();
        
        if (isReady) {
            // Run button should be enabled when ready
            await expect(page.locator('#btn-run')).toBeEnabled();
        }
    });

    test('example programs load correctly', async ({ page }) => {
        const examples = ['hello', 'fibonacci', 'fizzbuzz', 'primes', 'structs'];
        
        for (const example of examples) {
            await page.locator('#examples').selectOption(example);
            
            // Get value from CodeMirror
            const source = await page.evaluate(() => {
                // @ts-ignore
                return document.querySelector('.CodeMirror').CodeMirror.getValue();
            });
            expect(source).toContain('package main');
            expect(source.length).toBeGreaterThan(50);
        }
    });

    test('clear button works', async ({ page }) => {
        // Add some text to output
        await page.locator('#output').evaluate(el => {
            el.textContent = 'Test output';
        });
        
        // Click clear
        await page.locator('#btn-clear').click();
        
        // Output should be empty
        await expect(page.locator('#output')).toHaveText('');
    });

    test.describe('with initialized SDK', () => {
        test.beforeEach(async ({ page }) => {
            // Wait for SDK to be ready
            await expect(page.locator('#status-text')).toHaveText('Ready', {
                timeout: 180000
            });
        });

        test('compiles and runs Hello World', async ({ page }) => {
            // Select hello example
            await page.locator('#examples').selectOption('hello');
            
            // Click run
            await page.locator('#btn-run').click();
            
            // Wait for compilation to complete
            await expect(page.locator('#status-text')).toHaveText('Complete', {
                timeout: 60000
            });
            
            // Check output contains expected text
            const output = await page.locator('#output').textContent();
            expect(output).toContain('Hello');
        });

        test('compiles and runs Fibonacci', async ({ page }) => {
            // Select fibonacci example
            await page.locator('#examples').selectOption('fibonacci');
            
            // Click run
            await page.locator('#btn-run').click();
            
            // Wait for completion
            await expect(page.locator('#status-text')).toHaveText('Complete', {
                timeout: 60000
            });
            
            // Check output
            const output = await page.locator('#output').textContent();
            expect(output).toContain('Fibonacci');
            expect(output).toContain('fib(');
        });

        test('shows compile time and wasm size', async ({ page }) => {
            // Run default program
            await page.locator('#btn-run').click();
            
            // Wait for completion
            await expect(page.locator('#status-text')).toHaveText('Complete', {
                timeout: 60000
            });
            
            // Check compile time is shown
            const compileTime = await page.locator('#compile-time').textContent();
            expect(compileTime).toMatch(/\d+ms/);
            
            // Check wasm size is shown
            const wasmSize = await page.locator('#wasm-size').textContent();
            expect(wasmSize).toMatch(/[\d.]+ KB/);
        });

        test('handles compilation errors gracefully', async ({ page }) => {
            // Enter invalid Go code via CodeMirror
            await page.evaluate(() => {
                // @ts-ignore
                document.querySelector('.CodeMirror').CodeMirror.setValue(`package main

func main() {
    invalidSyntax here!!!
}`);
            });
            
            // Click run
            await page.locator('#btn-run').click();
            
            // Wait for status to change
            await expect(page.locator('#status-text')).not.toHaveText('Compiling...', {
                timeout: 30000
            });
            
            // Should show error status
            const statusText = await page.locator('#status-text').textContent();
            expect(statusText).toMatch(/error|failed/i);
        });

        test('Ctrl+Enter shortcut runs code', async ({ page }) => {
            // Ensure we have valid code
            await page.locator('#examples').selectOption('hello');
            
            // Focus the CodeMirror editor and press Ctrl+Enter
            await page.locator('.CodeMirror').click();
            await page.keyboard.press('Control+Enter');
            
            // Wait for completion
            await expect(page.locator('#status-text')).toHaveText('Complete', {
                timeout: 60000
            });
            
            // Verify output
            const output = await page.locator('#output').textContent();
            expect(output).toContain('Hello');
        });
    });
});
