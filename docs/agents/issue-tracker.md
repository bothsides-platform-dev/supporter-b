# Issue tracker: GitHub

Issues and specs live in `bothsides-platform-dev/supporter-b` on GitHub. This is
the tracker for Matt Pocock's engineering skills. Use `rtk proxy gh` from this
repository; verify the target with `rtk proxy gh repo view --json nameWithOwner`
before the first write. Never publish project work into `mattpocock/skills`.

## Operations

- Read a ticket: `rtk proxy gh issue view <number> --json number,title,body,labels,comments`.
- List tickets: `rtk proxy gh issue list --state open --json number,title,body,labels`.
- Publish a spec or ticket: write the body to a temporary Markdown file, then
  `rtk proxy gh issue create --title "..." --body-file <path>`.
- Update a body: `rtk proxy gh issue edit <number> --body-file <path>`.
- Comment: `rtk proxy gh issue comment <number> --body-file <path>`.
- Apply or remove labels with `rtk proxy gh issue edit <number> --add-label "..."`
  or `--remove-label "..."`; use `docs/agents/triage-labels.md`.
- Close with `rtk proxy gh issue close <number>` after recording the resolution.

When a skill says "publish to the issue tracker", create a GitHub issue. When it
says "fetch the relevant ticket", read that GitHub issue. Skill installation or
configuration alone does not authorize creating issues or posting comments.

**PRs as a request surface: no.** PRs remain the code review surface, not the
external request queue for triage. Preserve the repository's `dev` / `main` PR
and CI rules in [workflow.md](workflow.md#worktreeprci).

## Parent tickets and dependencies

Use GitHub sub-issues and native issue dependencies when supported by the
installed `gh` version and repository. Otherwise, put `Part of #<parent>` and
`Blocked by: #<number>` at the top of the child issue and link it from a task list
in the parent. A ticket is startable only after all blockers are closed.

For `wayfinder`, the map is an issue labelled `wayfinder:map`; children use
`wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or
`wayfinder:task`. Claim a startable, unassigned child with
`rtk proxy gh issue edit <number> --add-assignee @me`. Create those labels only
when that workflow is invoked. On resolution, record the result and link in the
map's Decisions-so-far section.
