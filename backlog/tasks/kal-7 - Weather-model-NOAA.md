---
id: KAL-7
title: Weather model (NOAA)
status: In Progress
assignee:
  - '@ros'
created_date: '2026-02-02 17:49'
updated_date: '2026-02-02 18:21'
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
