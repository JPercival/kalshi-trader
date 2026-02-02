---
id: KAL-12
title: Position sizer (Quarter-Kelly)
status: Done
assignee:
  - '@ros'
created_date: '2026-02-02 17:49'
updated_date: '2026-02-02 18:29'
labels:
  - engine
  - trading
dependencies:
  - KAL-11
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Kelly criterion: f* = (p*b - q) / b, then ÷ 4. Cap at MAX_POSITION_PCT of bankroll. Integer contract count. Conservative by design.
<!-- SECTION:DESCRIPTION:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Position sizer: Kelly criterion (full + quarter-Kelly), position cap at maxPositionPct, handles yes/no sides via sizeFromSignal. Returns contracts, costBasis, kelly fractions. 17 tests, 100% coverage.
<!-- SECTION:FINAL_SUMMARY:END -->
