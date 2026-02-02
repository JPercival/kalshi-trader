---
id: KAL-2
title: SQLite database layer
status: Done
assignee:
  - '@ros'
created_date: '2026-02-02 17:49'
updated_date: '2026-02-02 18:16'
labels:
  - database
dependencies:
  - KAL-1
references:
  - VISION.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Schema: markets, price_snapshots, model_estimates, paper_trades, daily_stats. Indexes on (ticker, timestamp), (category, status). Retention pruning helper.
<!-- SECTION:DESCRIPTION:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
SQLite database layer: 5 tables (markets, price_snapshots, model_estimates, paper_trades, daily_stats), 5 indexes, WAL mode, foreign keys, retention pruning. 15 tests, 100% coverage.
<!-- SECTION:FINAL_SUMMARY:END -->
