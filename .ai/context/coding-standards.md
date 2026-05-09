# Coding Standards

- Keep automation scripts small, explicit, and dependency-free where practical.
- Prefer committed context files over runtime repository scanning for agent prompts.
- Avoid adding a backend until a workflow proves it needs one.
- Do not print tokens, model request headers, or other secrets in logs.
- Keep generated agent output short and bounded with model token limits and prompt instructions.
- Use GitHub Actions permissions narrowly. Request only the permissions required by the workflow.
- Prefer GitHub Models with `GITHUB_TOKEN` for prototype AI calls.
- Keep workflow conditions readable and close to the trigger.
- Fail clearly when an external call fails, and post a short issue comment when that helps the user understand what happened.
- Avoid implementing future commands before they are needed.
