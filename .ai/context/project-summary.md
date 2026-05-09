# Project Summary

epic-proto is a quick prototype for a multi-agent semi-autonomous software team.

The current product direction is GitHub-first automation: agents should respond to GitHub issue comments and use committed repository context files as their operating context.

The first workflow is a `/plan` command. When a human comments `/plan` on an issue, GitHub Actions should build a prompt from committed `.ai` context, call GitHub Models with the built-in `GITHUB_TOKEN`, and post a short Project Lead plan back to the issue.

The second workflow is a `/review` command. When a trusted human comments `/review` on a pull request, GitHub Actions should route to the relevant review agents, call GitHub Models with the built-in `GITHUB_TOKEN`, and post a concise combined review comment back to the PR.

This repository is intentionally early-stage. Keep the implementation simple, inspectable, and easy to replace. Do not add a backend or require external AI provider secrets for the initial prototype.

The `workspace` and `workspaces` areas are for projects that the future AI team will work on. Automation scaffolding for epic-proto itself should live at the repository root.
