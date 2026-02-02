---
id: KAL-1
title: Project setup and config
status: Done
assignee:
  - '@ros'
created_date: '2026-02-02 17:49'
updated_date: '2026-02-02 18:15'
labels:
  - setup
dependencies: []
references:
  - VISION.md
  - .env.example
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Install deps (better-sqlite3, express, ejs, node-fetch), config loader from .env, directory structure per VISION.md. Entry point (src/index.js) that starts services.
<!-- SECTION:DESCRIPTION:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Project setup: npm install, config loader (src/config.js) with all env vars from .env.example, entry point (src/index.js) exporting main(), thin CLI runner (src/cli.js). Vitest configured with v8 coverage at 100% thresholds. 6 passing tests, 100% coverage.
<!-- SECTION:FINAL_SUMMARY:END -->
