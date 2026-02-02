---
id: KAL-6
title: Model interface and runner
status: Done
assignee:
  - '@ros'
created_date: '2026-02-02 17:49'
updated_date: '2026-02-02 18:20'
labels:
  - models
  - engine
dependencies:
  - KAL-3
  - KAL-4
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Standard contract: each model takes a market object, returns { estimated_prob, confidence, data_sources[], reasoning }. Model runner loops applicable models per market category. Stores results in model_estimates table.
<!-- SECTION:DESCRIPTION:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Model interface and runner: base model interface with validateEstimate, storeEstimate, getLatestEstimate. Model runner orchestrates registered models against category-matched active markets. 24 tests, 100% coverage.
<!-- SECTION:FINAL_SUMMARY:END -->
