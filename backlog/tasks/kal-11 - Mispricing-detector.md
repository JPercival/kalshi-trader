---
id: KAL-11
title: Mispricing detector
status: Done
assignee:
  - '@ros'
created_date: '2026-02-02 17:49'
updated_date: '2026-02-02 18:28'
labels:
  - engine
  - signals
dependencies:
  - KAL-6
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Compare model P(yes) vs market price. Signal when |edge| > MIN_EDGE_PCT and confidence > MIN_CONFIDENCE and liquidity > MIN_LIQUIDITY. Score signals by edge × confidence.
<!-- SECTION:DESCRIPTION:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Mispricing detector: compares latest model estimates to market prices, filters by min edge% and min confidence, scores by edge×confidence, returns sorted signals with side (yes/no) recommendation. 13 tests, 100% coverage.
<!-- SECTION:FINAL_SUMMARY:END -->
