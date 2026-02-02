---
id: KAL-3
title: Market ingestion service
status: To Do
assignee: []
created_date: '2026-02-02 17:49'
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
