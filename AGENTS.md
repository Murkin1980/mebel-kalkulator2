<!-- MPE:SCOPE-CHANGE-CONTROL:START -->
## Mandatory first read — MPE Scope & Change Control

Before planning, coding, refactoring, dependency changes, testing strategy, deployment, or checkpoint execution, read:

- `docs/governance/SCOPE-CHANGE-CONTROL.md`

Read it before project-specific source-of-truth documents. Then follow this repository's local rules and the current checkpoint/spec.

The scope policy governs minimal change, reuse, checkpoint boundaries, deep-change, testing, evidence, merge/deploy authority, and stopping conditions.

If a local rule appears to conflict with the scope policy, apply the documented source-of-truth priority. Do not silently weaken either rule; surface a deep-change conflict when required.
<!-- MPE:SCOPE-CHANGE-CONTROL:END -->

# AGENTS.md

Status: MANDATORY DEVELOPMENT INSTRUCTIONS

## Project-specific startup

After the mandatory scope policy, read the repository-local source-of-truth documents relevant to the task (for example README, PRODUCT, FOUNDATION, ARCHITECTURE, CHECKPOINT, STATUS, ROADMAP, SECURITY, or ADR files when present).

Do not invent missing source-of-truth documents just to satisfy this list. Inspect only what is relevant to the current task.

## Local rule

Preserve existing project behavior and contracts. Substantial work must stay inside the current approved task/checkpoint. If a project-specific invariant is discovered, treat it as authoritative unless it conflicts with a higher-priority owner instruction or requires a deep-change decision.
