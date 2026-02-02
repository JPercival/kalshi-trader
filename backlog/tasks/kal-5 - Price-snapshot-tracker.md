---
id: KAL-5
title: Price snapshot tracker
status: Done
assignee:
  - '@ros'
created_date: '2026-02-02 17:49'
updated_date: '2026-02-02 18:19'
labels:
  - api
  - prices
dependencies:
  - KAL-2
  - KAL-3
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every PRICE_SNAPSHOT_INTERVAL_MS, snapshot yes_bid, yes_ask, last_price, volume, open_interest for active markets. Store in price_snapshots table.
<!-- SECTION:DESCRIPTION:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Price snapshot tracker: recordSnapshot, snapshotAllActive (batch from markets table), getSnapshots with limit/since filters. 11 tests, 100% coverage.
<!-- SECTION:FINAL_SUMMARY:END -->
