---
id: KAL-13
title: Paper trade execution
status: In Progress
assignee:
  - '@ros'
created_date: '2026-02-02 17:49'
updated_date: '2026-02-02 18:29'
labels:
  - engine
  - trading
dependencies:
  - KAL-12
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When signal fires, create paper_trades entry with entry_price, contracts, cost_basis, model_edge. Track open positions. On market resolution, update exit_price, revenue, profit, resolution status.
<!-- SECTION:DESCRIPTION:END -->
