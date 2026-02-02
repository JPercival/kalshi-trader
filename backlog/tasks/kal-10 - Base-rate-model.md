---
id: KAL-10
title: Base rate model
status: Done
assignee:
  - '@ros'
created_date: '2026-02-02 17:49'
updated_date: '2026-02-02 18:27'
labels:
  - models
  - base-rate
dependencies:
  - KAL-6
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
For recurring series with 50+ historical resolutions, compute empirical resolution rate from Kalshi's own settled markets. Flag markets priced far from base rate without clear reason.
<!-- SECTION:DESCRIPTION:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Base rate model: computes historical yes/no resolution rates by series ticker, caches results with 5min TTL, scales confidence with sample size. Applies to all categories as a prior. 16 tests, 100% coverage.
<!-- SECTION:FINAL_SUMMARY:END -->
