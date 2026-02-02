---
id: KAL-2
title: SQLite database layer
status: To Do
assignee: []
created_date: '2026-02-02 17:49'
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
