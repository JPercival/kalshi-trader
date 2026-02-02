---
id: KAL-11
title: Mispricing detector
status: In Progress
assignee:
  - '@ros'
created_date: '2026-02-02 17:49'
updated_date: '2026-02-02 18:27'
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
