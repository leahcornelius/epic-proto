# EPIC AI prototype
A prototype of a multi-agent semi-autonomous software team: EPIC

## `/plan` GitHub issue command

Comment `/plan` at the start of a GitHub issue comment to ask the Project Lead Agent for a concise implementation plan. The workflow only runs on issues, ignores pull requests, and skips bot comments.

The workflow uses GitHub Actions and GitHub Models through the built-in `GITHUB_TOKEN`. No OpenAI or Anthropic API keys are required. Repository context is read from committed files under `.ai/`.

Required workflow permissions and secrets:

- `contents: read`
- `issues: write`
- `models: read`
- No extra secrets are required beyond the built-in `GITHUB_TOKEN`.

Current limitations:

- Prototype only; no backend service.
- `/plan` and `/review` are implemented.
- Uses short committed context files instead of inspecting the repo dynamically.
- Model output is intentionally brief and capped to keep issue comments controlled.
- No `/begin`, backend, database, cost logging, Slack integration, inline PR comments, or actual GitHub review approvals/request-changes.

## `/review` GitHub pull request command

Comment `/review` at the start of a pull request comment to ask AI review agents for a concise combined review. The workflow only runs on pull requests, skips bot comments, and only accepts comments from repository owners, collaborators, or members.

Available selectors:

- `/review` or `/review auto`
- `/review lead`
- `/review qa`
- `/review security`
- `/review devops`
- `/review api-contract` or `/review api`
- `/review all`

Auto-routing always runs Project Lead and QA. Security, DevOps, and API Contract run when changed file paths match `.ai/review-routing.json` or when the latest Project Lead `/plan` comment requests that reviewer.

To prevent runaway token use, `/review` filters previous AI-generated review comments and bot-authored comments out of prompt context by default. It preserves the latest Project Lead Agent Plan comment with a 2000-character cap, prefers relevant human PR comments created after the most recent AI PR Review, caps each human comment to 1000 characters, and caps total human comment context to 4000 characters. Diff, check output, and final prompt context are also locally budgeted before GitHub Models is called; truncated context is marked with `[truncated]`, and prompts that still exceed the local budget are skipped for that agent instead of sending an oversized request.

The review workflow posts one combined PR comment with selected reviewers, routing reasons, and each agent's review. Individual agent failures are reported in the combined comment when possible.
