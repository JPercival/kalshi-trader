---
id: KAL-13
title: Paper trade execution
status: Done
assignee:
  - '@ros'
created_date: '2026-02-02 17:49'
updated_date: '2026-02-02 18:31'
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

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Paper trade execution: openTrade (with duplicate check), closeTrade, getOpenTrades, getAllTrades, calculateBankroll, executePaperTrades (batch with bankroll depletion handling). 22 tests, 100% coverage.
<!-- SECTION:FINAL_SUMMARY:END -->
