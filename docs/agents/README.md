# Project Review Roles

_Last updated: October 2, 2026._

These Markdown files contain provider-neutral review instructions. They do not
choose a model, assign permissions, enable tools, or register agents in a
particular product. Read [AGENTS.md](../../AGENTS.md) for shared rules first.

| Role | Scope | When to use |
|---|---|---|
| [Code reviewer](code-reviewer.md) | Correctness, data preservation, lifecycle, accessibility, and regressions | After implementation, before committing or opening a PR |
| [Security auditor](security-auditor.md) | Authorization, privacy, public submissions, Storage, and abuse controls | After security/Supabase changes and before release |
| [Deployment preflight](deploy-preflight.md) | Build configuration, assets, rollout ordering, and release evidence | Before an authorized production push and at semester rollover |

Example request:

> Read AGENTS.md and docs/agents/code-reviewer.md. Review the current diff and
> report concrete findings. Do not edit files, commit, push, deploy, or modify
> production data.

If a tool supports delegated agents, give the reviewer the relevant file and
scope through that tool's supported configuration. Otherwise, the current
assistant can perform the same read-only review directly. Do not assume the
folder automatically registers agents or grants delegation permission.

Reviewers must distinguish source checks, local tests, browser interaction,
historical deployment records, and current production evidence. Report blocked
checks honestly. Report no findings when appropriate; do not invent issues.

Keep operational history in [HANDOFF.md](../../HANDOFF.md) and security/backend
rollout evidence in [supabase/README.md](../../supabase/README.md). Avoid copying
old asset hashes, row counts, or dependency versions into these reusable roles.
