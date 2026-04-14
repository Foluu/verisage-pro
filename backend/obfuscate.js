
/**
 * VeriSage Pro — Obfuscation Build Script
 * =========================================
 * Run from the backend/ folder:  node obfuscate.js
 *
 * What it does:
 *   1. Reads every .js file inside src/
 *   2. Applies heavy obfuscation using javascript-obfuscator
 *   3. Writes the protected files to dist/  (mirroring the same folder structure)
 *   4. Copies package.json and .env.example into dist/
 *
 * Deploy the dist/ folder to the client's server — never the src/ folder.
 *
 * The client will run:
 *   cd dist && npm install && node src/index.js
 *
 * Notes:
 *   - migrate.js is intentionally excluded from obfuscation so it remains
 *     readable for the one-time database setup step. Remove it from dist/
 *     after migration is complete if desired.
 *   - The .env file is NEVER copied — the client fills that in themselves.
 *   - node_modules are never obfuscated — only your source code is protected.
 */

const JavaScriptObfuscator = require('javascript-obfuscator');
const fs   = require('fs');
const path = require('path');

// ── Configuration ─────────────────────────────────────────────────────────────

const SRC_DIR  = path.join(__dirname, 'src');
const DIST_DIR = path.join(__dirname, 'dist');

// Files to skip obfuscation on (kept plain-text in dist/)
// migrate.js needs to be readable for the one-time DB setup.
const SKIP_OBFUSCATION = ['migrate.js'];

// ── Obfuscator Options ────────────────────────────────────────────────────────
// These settings give maximum protection while keeping the code fully functional.
// Do NOT enable renameGlobals — it breaks require() module resolution in Node.js.

const OBFUSCATOR_OPTIONS = {
  // ── Core protection ──────────────────────────────────────────────────────
  compact:                          true,   // Remove whitespace/newlines
  simplify:                         true,   // Simplify expressions
  splitStrings:                     true,   // Split strings into chunks
  splitStringsChunkLength:          5,      // Chunk size for split strings
  stringArray:                      true,   // Move strings into a lookup array
  stringArrayEncoding:              ['rc4'], // Encode the string array with RC4
  stringArrayThreshold:             0.85,   // 85% of strings go into the array
  stringArrayCallsTransform:        true,   // Transform calls to the string array
  stringArrayRotate:                true,   // Rotate the string array
  stringArrayShuffle:               true,   // Shuffle the string array order
  stringArrayWrappersCount:         3,      // Multiple wrapper functions
  stringArrayWrappersType:          'function',
  stringArrayIndexesType:           ['hexadecimal-number'],

  // ── Identifier renaming ───────────────────────────────────────────────────
  identifierNamesGenerator:         'hexadecimal', // var _0x1a2b3c style names
  renameProperties:                 false,  // MUST be false — breaks mssql/express
  renameGlobals:                    false,  // MUST be false — breaks require()

  // ── Control flow ──────────────────────────────────────────────────────────
  controlFlowFlattening:            true,   // Flatten if/else/switch structures
  controlFlowFlatteningThreshold:   0.5,    // 50% of blocks flattened
  deadCodeInjection:                true,   // Inject fake unreachable code paths
  deadCodeInjectionThreshold:       0.2,    // 20% dead code injection rate

  // ── Anti-reverse-engineering ──────────────────────────────────────────────
  selfDefending:                    false,  // Disabled — breaks Node.js (browser-only feature)
  debugProtection:                  false,  // Disabled — not relevant for server-side Node.js
  disableConsoleOutput:             false,  // Keep console — needed for Winston logging

  // ── Numbers ───────────────────────────────────────────────────────────────
  numbersToExpressions:             true,   // Convert 1433 → (0x1f + 0x582) etc.
  transformObjectKeys:              true,   // Rename object property keys

  // ── Source maps ───────────────────────────────────────────────────────────
  // Keep source maps OFF — they would undo the obfuscation by mapping back to original
  sourceMap:                        false,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getAllJsFiles(dir, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      getAllJsFiles(fullPath, results);
    } else if (entry.name.endsWith('.js')) {
      results.push(fullPath);
    }
  }
  return results;
}

// ── Main build ────────────────────────────────────────────────────────────────

function build() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║     VeriSage Pro — Obfuscation Build             ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  // Clean dist/src
  const distSrc = path.join(DIST_DIR, 'src');
  if (fs.existsSync(distSrc)) fs.rmSync(distSrc, { recursive: true });
  ensureDir(distSrc);

  const files = getAllJsFiles(SRC_DIR);
  let obfuscated = 0;
  let skipped    = 0;
  let errors     = 0;

  for (const filePath of files) {
    const fileName    = path.basename(filePath);
    const relativePath = path.relative(SRC_DIR, filePath);
    const outputPath  = path.join(distSrc, relativePath);

    ensureDir(path.dirname(outputPath));

    const source = fs.readFileSync(filePath, 'utf8');

    if (SKIP_OBFUSCATION.includes(fileName)) {
      // Copy plain (not obfuscated) — needed for readable migration
      fs.writeFileSync(outputPath, source, 'utf8');
      console.log(`  [SKIP]  ${relativePath}  (kept plain for setup)`);
      skipped++;
      continue;
    }

    try {
      const result = JavaScriptObfuscator.obfuscate(source, OBFUSCATOR_OPTIONS);
      fs.writeFileSync(outputPath, result.getObfuscatedCode(), 'utf8');
      const originalSize   = Buffer.byteLength(source, 'utf8');
      const obfuscatedSize = Buffer.byteLength(result.getObfuscatedCode(), 'utf8');
      const ratio = ((obfuscatedSize / originalSize) * 100).toFixed(0);
      console.log(`  [OK]    ${relativePath.padEnd(48)}  ${(originalSize/1024).toFixed(1)}KB → ${(obfuscatedSize/1024).toFixed(1)}KB  (${ratio}%)`);
      obfuscated++;
    } catch (err) {
      console.error(`  [ERR]   ${relativePath}  — ${err.message}`);
      errors++;
    }
  }

  // Copy package.json into dist/ (not dist/src — it lives at root)
  const pkgSrc  = path.join(__dirname, 'package.json');
  const pkgDest = path.join(DIST_DIR, 'package.json');

  // Rewrite package.json so "start" points to dist/src/index.js
  const pkg = JSON.parse(fs.readFileSync(pkgSrc, 'utf8'));
  pkg.scripts = {
    start:   'node src/index.js',
    migrate: 'node src/config/migrate.js',
  };
  // Remove dev dependencies — client doesn't need nodemon
  delete pkg.devDependencies;
  fs.writeFileSync(pkgDest, JSON.stringify(pkg, null, 2), 'utf8');
  console.log(`\n  [COPY]  package.json  (dev deps removed, scripts updated)`);

  // Copy .env.example
  const envSrc  = path.join(__dirname, '.env.example');
  const envDest = path.join(DIST_DIR, '.env.example');
  if (fs.existsSync(envSrc)) {
    fs.copyFileSync(envSrc, envDest);
    console.log(`  [COPY]  .env.example`);
  }

  // Copy logs/ directory placeholder
  const logsDir = path.join(DIST_DIR, 'logs');
  ensureDir(logsDir);
  fs.writeFileSync(
    path.join(logsDir, '.gitkeep'),
    '# Log files are written here by Winston\n'
  );
  console.log(`  [COPY]  logs/ directory (placeholder)`);

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────────────');
  console.log(`  Files obfuscated : ${obfuscated}`);
  console.log(`  Files skipped    : ${skipped}`);
  console.log(`  Errors           : ${errors}`);
  console.log(`  Output directory : ${DIST_DIR}`);
  console.log('──────────────────────────────────────────────────────');

  if (errors > 0) {
    console.error('\n  ⚠  Build completed with errors. Review above before deploying.\n');
    process.exit(1);
  } else {
    console.log('\n  ✓  Build complete. Deploy the dist/ folder to the client server.\n');
    console.log('  Client setup steps:');
    console.log('    1. cd dist/');
    console.log('    2. cp .env.example .env  →  fill in all values');
    console.log('    3. npm install');
    console.log('    4. node src/config/migrate.js   (run ONCE to create tables)');
    console.log('    5. pm2 start src/index.js --name verisage-pro\n');
  }
}

build();