#!/usr/bin/env node

// Startup wrapper that logs the actual error if the app crashes
console.log('[start] Node version:', process.version);
console.log('[start] Platform:', process.platform, process.arch);
console.log('[start] PORT:', process.env.PORT);
console.log('[start] DB_PATH:', process.env.DB_PATH);

try {
  // Test native module loading first
  console.log('[start] Loading better-sqlite3...');
  await import('better-sqlite3');
  console.log('[start] better-sqlite3 loaded OK');
} catch (err) {
  console.error('[start] FATAL: Failed to load better-sqlite3:', err.message);
  console.error(err.stack);
  process.exit(1);
}

try {
  console.log('[start] Loading main module...');
  const { main } = await import('./index.js');
  console.log('[start] Starting app...');
  await main();
} catch (err) {
  console.error('[start] FATAL:', err.message);
  console.error(err.stack);
  process.exit(1);
}
