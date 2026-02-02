---
id: KAL-14
title: Resolution tracker
status: Done
assignee:
  - '@ros'
created_date: '2026-02-02 17:49'
updated_date: '2026-02-02 18:32'
labels:
  - engine
  - analytics
dependencies:
  - KAL-13
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Poll settled markets, match to open paper_trades, compute P&L. Aggregate into daily_stats. Track win rate, avg edge, best category. This is the core validation data.
<!-- SECTION:DESCRIPTION:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Resolution tracker: resolveSettledTrades settles open trades against market results, getPerformanceStats with per-category breakdown, updateDailyStats with upsert, findBestCategory. 16 tests, 100% coverage.
<!-- SECTION:FINAL_SUMMARY:END -->
