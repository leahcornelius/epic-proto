# epic-proto
A prototype of a multi-agent semi-autonomous software team

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
- Only `/plan` is implemented.
- Uses short committed context files instead of inspecting the repo dynamically.
- Model output is intentionally brief and capped to keep issue comments controlled.
