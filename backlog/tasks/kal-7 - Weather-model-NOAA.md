---
id: KAL-7
title: Weather model (NOAA)
status: Done
assignee:
  - '@ros'
created_date: '2026-02-02 17:49'
updated_date: '2026-02-02 18:23'
labels:
  - models
  - weather
dependencies:
  - KAL-6
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
NOAA Weather API (api.weather.gov, free, no key). Parse Kalshi weather market titles to extract location + threshold + timeframe. Fetch NOAA probabilistic forecast. Output P(yes) + confidence.
<!-- SECTION:DESCRIPTION:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Weather model: parses market titles for city+temperature threshold, fetches NOAA forecast, estimates probability via logistic function with forecast uncertainty. 20 city coords, configurable fetch for testing. 27 tests, 100% coverage.
<!-- SECTION:FINAL_SUMMARY:END -->
