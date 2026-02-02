---
id: KAL-12
title: Position sizer (Quarter-Kelly)
status: To Do
assignee: []
created_date: '2026-02-02 17:49'
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
