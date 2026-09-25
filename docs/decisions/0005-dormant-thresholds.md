# ADR 0005: Dormant and reconnect thresholds

- Status: Accepted
- Date: 2026-06-20
- Deciders: Nova Collective team

## Context

Orbit's dormant ring and Connect's reconnect suggestions both depend on "how long since the last activity". We need starting thresholds, kept configurable rather than hard-coded.

## Decision

**V1 activity bands** (based on `last_interaction`, the latest `activity_date` for a profile):

| Band | Threshold | Used by |
|---|---|---|
| **Active** | 0–6 months since last activity | Default state; inner/active Orbit rings |
| **Reconnect** | 6–9 months since last activity | Connect reconnect suggestions; Orbit "going quiet" signal |
| **Dormant** | 9+ months since last activity | Orbit dormant ring; leadership reporting |

**Connect reconnect rule:** strong or inner-circle owner strength, plus in the reconnect band (6+ months no activity).

Values live in a config module (`src/config/relationship-thresholds.ts` or env-backed), not in migrations or SQL literals. Orbit and Connect read from config. Revisit once there is enough activity history to see the real distribution.

## Consequences

- Single config source for all recency-based features.
- Thresholds tunable without deploy once moved to env/admin settings (Phase 2).
- Domain model Orbit section and Connect queries reference this ADR.
