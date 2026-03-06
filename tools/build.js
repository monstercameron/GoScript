#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');
const distDir = path.join(rootDir, 'dist');

const sources = {
    wasmExec: fs.readFileSync(path.join(srcDir, 'wasm_exec.js'), 'utf8'),
    platform: fs.readFileSync(path.join(srcDir, 'platform.js'), 'utf8'),
    engine: fs.readFileSync(path.join(srcDir, 'engine.js'), 'utf8'),
    sdk: fs.readFileSync(path.join(srcDir, 'goscript-sdk.js'), 'utf8')
};

const packageVersion = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')).version;
const buildDate = new Date().toISOString().replace('T', ' ').slice(0, 19);

const banner = `/**
 * GoScript SDK v${packageVersion}
 * Browser-based Go compiler using WebAssembly
 *
 * Includes:
 * - GoScript SDK (MIT License)
 * - Go wasm_exec.js (BSD License)
 *
 * Built: ${buildDate}
 */

`;

const runtimeContent = `${sources.platform}\n\n${sources.engine}\n\n${sources.sdk}`;
const browserBundle = `${banner}// ============================================================
// Go WASM Runtime (wasm_exec.js)
// ============================================================

${sources.wasmExec}

// ============================================================
// GoScript SDK
// ============================================================

${runtimeContent}
`;

const sdkOnly = `${banner}${runtimeContent}\n`;

const packageExports = `
export {
    GoScript,
    VirtualFileSystem,
    FSPolyfill,
    CacheManager,
    ToolchainLoader,
    CompilationManager,
    AppRunner
};

export default GoScript;
`;

const packageExportsCjs = `
module.exports = {
    GoScript,
    VirtualFileSystem,
    FSPolyfill,
    CacheManager,
    ToolchainLoader,
    CompilationManager,
    AppRunner,
    default: GoScript
};
`;

const esmEntry = `${banner}${sources.wasmExec}\n\n${runtimeContent}\n${packageExports}`;
const cjsEntry = `${banner}${sources.wasmExec}\n\n${runtimeContent}\n${packageExportsCjs}`;

async function main() {
    fs.mkdirSync(distDir, { recursive: true });

    const outputs = [
        ['goscript.bundle.js', browserBundle],
        ['goscript.js', sdkOnly],
        ['index.mjs', esmEntry],
        ['index.cjs', cjsEntry],
        ['wasm_exec.js', `${banner}${sources.wasmExec}\n`]
    ];

    for (const [name, content] of outputs) {
        fs.writeFileSync(path.join(distDir, name), content, 'utf8');
    }

    const minified = await Promise.all([
        minify(browserBundle, { compress: true, mangle: true }),
        minify(sdkOnly, { compress: true, mangle: true })
    ]);

    fs.writeFileSync(path.join(distDir, 'goscript.bundle.min.js'), minified[0].code, 'utf8');
    fs.writeFileSync(path.join(distDir, 'goscript.min.js'), minified[1].code, 'utf8');

    logFile('dist/goscript.bundle.js');
    logFile('dist/goscript.js');
    logFile('dist/index.mjs');
    logFile('dist/index.cjs');
    logFile('dist/wasm_exec.js');
    logFile('dist/goscript.bundle.min.js');
    logFile('dist/goscript.min.js');

    const packPath = path.join(rootDir, 'docs', 'assets', 'goscript.pack');
    if (fs.existsSync(packPath)) {
        const sizeMb = (fs.statSync(packPath).size / (1024 * 1024)).toFixed(1);
        console.log(`docs/assets/goscript.pack - ${sizeMb} MB (toolchain)`);
    }

    console.log('');
    console.log('Package usage:');
    console.log(`  import GoScript from 'goscript';`);
    console.log(`  const gs = new GoScript({ packUrl: '/assets/goscript.pack' });`);
}

function logFile(relativePath) {
    const fullPath = path.join(rootDir, relativePath);
    const sizeKb = (fs.statSync(fullPath).size / 1024).toFixed(1);
    console.log(`${relativePath} - ${sizeKb} KB`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
