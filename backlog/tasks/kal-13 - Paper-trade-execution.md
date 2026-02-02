---
id: KAL-13
title: Paper trade execution
status: To Do
assignee: []
created_date: '2026-02-02 17:49'
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
