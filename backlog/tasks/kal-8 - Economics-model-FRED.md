---
id: KAL-8
title: Economics model (FRED)
status: Done
assignee:
  - '@ros'
created_date: '2026-02-02 17:49'
updated_date: '2026-02-02 18:24'
labels:
  - models
  - economics
dependencies:
  - KAL-6
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
FRED API (free with key). For CPI/GDP/unemployment markets, fetch latest data + Cleveland Fed nowcast. Compare consensus to Kalshi pricing.
<!-- SECTION:DESCRIPTION:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Economics model: FRED API integration for CPI, GDP, unemployment, nonfarm payrolls, PCE. Parses market titles for indicator type and threshold, fetches historical data, estimates probability via z-score logistic model. 37 tests, 100% coverage.
<!-- SECTION:FINAL_SUMMARY:END -->
