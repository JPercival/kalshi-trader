#!/usr/bin/env node
import http from 'http';

const port = process.env.PORT || 3001;

// Startup wrapper — logs diagnostics and spins up a temp health server
// so Railway's health check passes while the real app boots
console.log('[start] Node version:', process.version);
console.log('[start] Platform:', process.platform, process.arch);
console.log('[start] PORT:', port);
console.log('[start] DB_PATH:', process.env.DB_PATH);
console.log('[start] CWD:', process.cwd());

// Temp health server — binds immediately so Railway sees a healthy app
const tempServer = http.createServer((req, res) => {
  console.log(`[start] Health check hit: ${req.url}`);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'starting', timestamp: Date.now() }));
});
tempServer.listen(port, '0.0.0.0', () => {
  console.log(`[start] Temp health server on 0.0.0.0:${port}`);
});

try {
  console.log('[start] Loading better-sqlite3...');
  const bs3 = await import('better-sqlite3');
  console.log('[start] better-sqlite3 loaded OK:', typeof bs3.default);
} catch (err) {
  console.error('[start] FATAL: Failed to load better-sqlite3:', err.message);
  console.error(err.stack);
  // Keep temp server running so we can see the error in logs
  // rather than Railway just saying "never became healthy"
  setInterval(() => {}, 60000);
  throw err;
}

try {
  // Close temp server before real app binds to same port
  await new Promise(resolve => tempServer.close(resolve));
  console.log('[start] Temp server closed, starting real app...');

  const { main } = await import('./index.js');
  await main();
  console.log('[start] App started successfully');
} catch (err) {
  console.error('[start] FATAL:', err.message);
  console.error(err.stack);
  process.exit(1);
}
