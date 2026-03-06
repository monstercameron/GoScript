#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

/**
 * @param {Promise<any>|(() => Promise<any>)} workPromise
 * @param {string} fallbackMessage
 * @returns {Promise<[any, null] | [null, Error]>}
 */
function captureAsyncResult(workPromise, fallbackMessage) {
    const promiseValue = typeof workPromise === 'function' ? Promise.resolve().then(workPromise) : Promise.resolve(workPromise);
    return promiseValue.then(
        (workResult) => [workResult, null],
        (caughtError) => [null, caughtError instanceof Error ? caughtError : new Error(fallbackMessage)]
    );
}

const rootDirectoryPath = path.resolve(__dirname, '..');
const distDirectoryPath = path.join(rootDirectoryPath, 'dist');

async function readTextFile(relativePath) {
    const absoluteFilePath = path.join(rootDirectoryPath, relativePath);
    const [fileContents, readError] = await captureAsyncResult(
        fs.promises.readFile(absoluteFilePath, 'utf8'),
        `Failed to read ${relativePath}`
    );
    if (readError) {
        throw readError;
    }

    return fileContents;
}

async function writeTextFile(relativePath, fileContents) {
    const absoluteFilePath = path.join(rootDirectoryPath, relativePath);
    const [, writeError] = await captureAsyncResult(
        fs.promises.writeFile(absoluteFilePath, fileContents, 'utf8'),
        `Failed to write ${relativePath}`
    );
    if (writeError) {
        throw writeError;
    }
}

async function logFileSize(relativePath) {
    const absoluteFilePath = path.join(rootDirectoryPath, relativePath);
    const [fileStats, statsError] = await captureAsyncResult(
        fs.promises.stat(absoluteFilePath),
        `Failed to stat ${relativePath}`
    );
    if (statsError) {
        throw statsError;
    }

    const fileSizeKb = (fileStats.size / 1024).toFixed(1);
    console.log(`${relativePath} - ${fileSizeKb} KB`);
}

async function main() {
    const [packageJsonText, packageJsonError] = await captureAsyncResult(
        fs.promises.readFile(path.join(rootDirectoryPath, 'package.json'), 'utf8'),
        'Failed to read package.json'
    );
    if (packageJsonError) {
        throw packageJsonError;
    }

    const [packageManifest, manifestError] = await captureAsyncResult(
        Promise.resolve().then(() => JSON.parse(packageJsonText)),
        'Failed to parse package.json'
    );
    if (manifestError) {
        throw manifestError;
    }

    const sourceFiles = {
        wasmExec: await readTextFile(path.join('src', 'wasm_exec.js')),
        constants: await readTextFile(path.join('src', 'constants.js')),
        platform: await readTextFile(path.join('src', 'platform.js')),
        engine: await readTextFile(path.join('src', 'engine.js')),
        sdk: await readTextFile(path.join('src', 'goscript-sdk.js'))
    };

    const packageVersion = packageManifest.version;
    const buildTimestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const banner = `/**\n * GoScript SDK v${packageVersion}\n * Browser-based Go compiler using WebAssembly\n *\n * Includes:\n * - GoScript SDK (MIT License)\n * - Go wasm_exec.js (BSD License)\n *\n * Built: ${buildTimestamp}\n */\n\n`;

    const runtimeBundleSource = `${sourceFiles.constants}\n\n${sourceFiles.platform}\n\n${sourceFiles.engine}\n\n${sourceFiles.sdk}`;
    const browserBundleSource = `${banner}// ============================================================\n// Go WASM Runtime (wasm_exec.js)\n// ============================================================\n\n${sourceFiles.wasmExec}\n\n// ============================================================\n// GoScript SDK\n// ============================================================\n\n${runtimeBundleSource}\n`;
    const sdkBundleSource = `${banner}${runtimeBundleSource}\n`;

    const esmExportSource = `\nexport {\n    createGoScript,\n    GoScript,\n    GoScriptConstants,\n    VirtualFileSystem,\n    FSPolyfill,\n    CacheManager,\n    ToolchainLoader,\n    CompilationManager,\n    AppRunner\n};\n\nexport default GoScript;\n`;
    const cjsExportSource = `\nmodule.exports = {\n    createGoScript,\n    GoScript,\n    GoScriptConstants,\n    VirtualFileSystem,\n    FSPolyfill,\n    CacheManager,\n    ToolchainLoader,\n    CompilationManager,\n    AppRunner,\n    default: GoScript\n};\n`;

    const esmEntrySource = `${banner}${sourceFiles.wasmExec}\n\n${runtimeBundleSource}\n${esmExportSource}`;
    const cjsEntrySource = `${banner}${sourceFiles.wasmExec}\n\n${runtimeBundleSource}\n${cjsExportSource}`;

    const [, mkdirError] = await captureAsyncResult(
        fs.promises.mkdir(distDirectoryPath, { recursive: true }),
        'Failed to create the dist directory'
    );
    if (mkdirError) {
        throw mkdirError;
    }

    const outputFiles = [
        ['dist/goscript.bundle.js', browserBundleSource],
        ['dist/goscript.js', sdkBundleSource],
        ['dist/index.mjs', esmEntrySource],
        ['dist/index.cjs', cjsEntrySource],
        ['dist/wasm_exec.js', `${banner}${sourceFiles.wasmExec}\n`]
    ];

    for (const [relativePath, fileContents] of outputFiles) {
        await writeTextFile(relativePath, fileContents);
    }

    const [minifiedOutputs, minifyError] = await captureAsyncResult(
        () => Promise.all([
            minify(browserBundleSource, { compress: true, mangle: true }),
            minify(sdkBundleSource, { compress: true, mangle: true })
        ]),
        'Failed to minify GoScript bundles'
    );
    if (minifyError) {
        throw minifyError;
    }

    await writeTextFile('dist/goscript.bundle.min.js', minifiedOutputs[0].code);
    await writeTextFile('dist/goscript.min.js', minifiedOutputs[1].code);

    await logFileSize('dist/goscript.bundle.js');
    await logFileSize('dist/goscript.js');
    await logFileSize('dist/index.mjs');
    await logFileSize('dist/index.cjs');
    await logFileSize('dist/wasm_exec.js');
    await logFileSize('dist/goscript.bundle.min.js');
    await logFileSize('dist/goscript.min.js');

    const packFilePath = path.join(rootDirectoryPath, 'docs', 'assets', 'goscript.pack');
    const [packStats, packStatsError] = await captureAsyncResult(
        fs.promises.stat(packFilePath),
        'Failed to stat docs/assets/goscript.pack'
    );
    if (!packStatsError) {
        const packSizeMb = (packStats.size / (1024 * 1024)).toFixed(1);
        console.log(`docs/assets/goscript.pack - ${packSizeMb} MB (toolchain)`);
    }

    console.log('');
    console.log('Package usage:');
    console.log(`  import GoScript from 'goscript';`);
    console.log(`  const goScriptSdk = new GoScript({ packUrl: '/assets/goscript.pack' });`);
}

captureAsyncResult(main(), 'Build failed').then(([, buildError]) => {
    if (!buildError) {
        return;
    }

    console.error(buildError);
    process.exit(1);
});
