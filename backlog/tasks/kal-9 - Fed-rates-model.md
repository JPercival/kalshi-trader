---
id: KAL-9
title: Fed rates model
status: Done
assignee:
  - '@ros'
created_date: '2026-02-02 17:49'
updated_date: '2026-02-02 18:26'
labels:
  - models
  - fed
dependencies:
  - KAL-6
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CME FedWatch implied probabilities. Compare to Kalshi Fed decision markets. May need to scrape CME or use a proxy data source.
<!-- SECTION:DESCRIPTION:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fed rates model: parses market titles for cut/hike/hold actions + basis points, estimates probability from FRED fed funds rate trend analysis. Handles trend direction, volatility for holds, basis point scaling for large moves. 35 tests, 100% coverage.
<!-- SECTION:FINAL_SUMMARY:END -->
