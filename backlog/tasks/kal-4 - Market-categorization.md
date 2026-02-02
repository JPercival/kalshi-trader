---
id: KAL-4
title: Market categorization
status: Done
assignee:
  - '@ros'
created_date: '2026-02-02 17:49'
updated_date: '2026-02-02 18:19'
labels:
  - ingestion
dependencies:
  - KAL-3
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Classify markets by series_ticker into categories (Weather, Economics, Fed, Politics, etc.). Map series prefixes to categories. Store in markets.category.
<!-- SECTION:DESCRIPTION:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Market categorization: regex-based categorizer matching series_ticker/event_ticker then title keywords. 7 categories (weather, economics, fed_rates, politics, sports, crypto, finance) + 'other' fallback. DB batch update for uncategorized markets. 20 tests, 100% coverage.
<!-- SECTION:FINAL_SUMMARY:END -->
