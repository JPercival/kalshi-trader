#!/usr/bin/env node
import { main } from './index.js';

main().catch((err) => {
  console.error('[kalshi-trader] Fatal error:', err);
  process.exit(1);
});
