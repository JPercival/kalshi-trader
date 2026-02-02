---
id: KAL-3
title: Market ingestion service
status: Done
assignee:
  - '@ros'
created_date: '2026-02-02 17:49'
updated_date: '2026-02-02 18:18'
labels:
  - api
  - ingestion
dependencies:
  - KAL-1
references:
  - VISION.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Poll Kalshi API (GET /trade-api/v2/events, /markets) every MARKET_POLL_INTERVAL_MS. Upsert into markets table. Track status transitions (active → closed → settled). Capture result on settlement.
<!-- SECTION:DESCRIPTION:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Market ingestion: Kalshi API client (kalshi-client.js) with cursor pagination for events/markets/single-market endpoints. Ingestion service (ingestion.js) upserts market data into SQLite with status mapping, COALESCE for category/result preservation. 12+16 tests, 100% coverage.
<!-- SECTION:FINAL_SUMMARY:END -->
