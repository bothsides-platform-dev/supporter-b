# Domain docs

This repository has one domain context. Keep its established documentation
paths; do not create a second glossary to satisfy a skill's default filename.

Before exploring an area, read:

- `CONTEXT.md`: the shared domain vocabulary. This is the existing equivalent
  of the skills' default `GLOSSARY.md`.
- Relevant decisions in `docs/adr/`.
- `CLAUDE.md` and the relevant confirmed decisions in `SCREEN_DESIGN.md` for
  product rules. Code and tests remain authoritative for implemented behavior.
- `UX_WRITING.md` when writing user-facing Korean copy, and `DESIGN.md` when
  changing visual design.

Use the terms in `CONTEXT.md` in explanations, issue titles, proposals, and test
names. Keep English code identifiers and routes literal. If a skill writes
domain terms or decisions, update `CONTEXT.md` or `docs/adr/` respectively.

Read only ADRs relevant to the task. Surface conflicts with an existing decision
instead of silently replacing it. Historical artifacts under
`docs/superpowers/` are not current product rules.

`AGENTS.md` is a relative symlink to `CLAUDE.md`. Edit `CLAUDE.md` in place when
changing agent guidance; never replace or rewrite the symlink.
