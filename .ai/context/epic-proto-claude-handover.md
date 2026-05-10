# EPIC / epic-proto handover for Claude Code / Cowork

## Purpose of this handover

This document is intended to brief Claude Code / Cowork on the current state, design intent, and next implementation direction for **EPIC**, currently prototyped as **epic-proto**.

The goal is not to provide generic background on AI coding agents. The goal is to give enough project-specific context that an implementation agent can work productively inside the repo without re-litigating the entire design from scratch like a committee of caffeinated raccoons.

---

## Project name and concept

**Project:** EPIC / epic-proto  
**Current form:** GitHub Actions based prototype  
**Core idea:** A GitHub-native, human-governed, multi-agent software engineering workflow.

EPIC is designed as a small AI-assisted engineering workflow that operates through normal GitHub surfaces:

- GitHub Issues
- GitHub Pull Requests
- PR comments
- GitHub Actions
- GitHub Checks / CI results
- Repository context files

The intended model is not “an autonomous AI company.” That framing is too theatrical and quickly degenerates into roleplay soup. The better framing is:

> A GitHub-native, human-in-the-loop orchestration layer for issue planning, implementation routing, specialist PR review, and evidence synthesis.

The human remains the engineering lead and merge authority. Agents help plan, implement, review, summarise, and surface risk. They do **not** own product judgment, architecture, security approval, or final merge authority.

---

## Design philosophy

The system should optimise for:

1. **Useful planning before implementation**
2. **Role separation where it creates real value**
3. **Selective specialist review, not agent spam**
4. **Human approval gates for risky actions**
5. **Evidence-aware PR decisions**
6. **GitHub-native operation**
7. **Prototype simplicity before backend complexity**
8. **Security by default, even while prototyping**

The system should avoid:

- Running every agent on every change
- Letting AI approve AI
- Letting review agents push code by default
- Treating repo content, PR comments, logs, or tool output as trusted instructions
- Building a custom dashboard before GitHub comments/checks stop being enough
- Measuring success by number of comments, number of PRs, or “AI wrote X% of code”
- Adding fake company roles like Scrum Master, VP of Synergy, or other corporate cosplay demons

---

## Current prototype state

The current prototype already has a working GitHub Actions based flow.

### `/plan`

`/plan` works on GitHub issues.

Current behaviour:

- A **Project Lead Agent** reads the GitHub issue.
- It also reads committed repository context files.
- It calls GitHub Models using `GITHUB_TOKEN`.
- It posts a concise implementation plan back to the issue.

This is currently issue-stage planning only. It should remain plan-first, not silently become implementation.

### `/review`

`/review` works on pull requests.

Supported commands:

- `/review`
- `/review all`
- `/review lead`
- `/review qa`
- `/review security`
- `/review devops`
- `/review api-contract`

Current behaviour:

- The review command can route agents based on changed files.
- It can also route agents based on whether the Project Lead plan requested them.
- The current agents are:
  - Project Lead
  - QA
  - Security
  - DevOps
  - API Contract

The current implementation is **GitHub Actions based**, not a backend service.

The prototype is deliberately personal-use/prototype-grade for now. It is not yet trying to be a hardened commercial product.

---

## Intended end goal

The intended end goal is a GitHub-native workflow where EPIC can assist across the lifecycle of an issue or PR:

1. A human opens or selects an issue.
2. The human invokes `/plan`.
3. The Project Lead Agent creates a structured implementation plan.
4. The plan identifies scope, affected areas, acceptance criteria, risks, and recommended reviewers.
5. A human approves moving from planning to implementation.
6. An implementer agent may eventually be invoked explicitly with `/implement`.
7. A PR is opened or updated.
8. Specialist review agents run selectively, based on plan and changed files.
9. A Project Lead / coordinator agent runs after specialist review.
10. The coordinator assesses whether the PR goal has been reached.
11. If changes are required, it creates a clear follow-up plan for the builder/implementer.
12. If the PR is good enough to merge, it signs off in a clear advisory sense.
13. The human retains final merge authority.

The project should feel like a disciplined engineering workflow, not like dumping code into a chatbot and hoping the silicon goblin has taste.

---

## Important design change under discussion: Project Lead role

The Project Lead role needs to become clearer and more valuable.

### Current issue

At present, the Project Lead can behave too much like “another reviewer” that flags issues. That is not enough.

### Desired role

The Project Lead should act as a **coordinator and decision synthesiser**.

Its purpose is to:

- Coordinate the other agents and the human lead.
- Keep the workflow moving.
- Understand the issue goal and plan.
- Interpret specialist reviews.
- Decide what matters before merge.
- Distinguish blocking issues from non-blocking observations.
- Produce the next action plan if more work is needed.
- Provide a final advisory sign-off if the PR satisfies the goal.

### Desired review-stage timing

The Project Lead should usually run **after** the other review agents, not before them.

In review mode, the Project Lead should consume:

- Original issue context
- Existing plan
- PR diff summary
- Specialist agent outputs
- CI/check evidence where available
- Any human comments or explicit constraints

Then it should answer:

1. Does this PR appear to satisfy the original goal?
2. Are there any blocking issues raised by specialists?
3. Which specialist findings actually need to be addressed before merge?
4. Which findings are optional, follow-up, or non-blocking?
5. What precise changes should the builder/implementer make next?
6. Can the PR be merged from an EPIC workflow perspective?

This turns the Project Lead into an actual coordinator rather than a fancy lint rule with opinions.

---

## Recommended Project Lead review output

The Project Lead review output should be structured and concise.

Suggested format:

```markdown
## Project Lead Review Summary

### Merge readiness
Status: BLOCKED | READY_WITH_NOTES | READY

### Goal alignment
- Original goal: ...
- Assessment: ...

### Blocking issues
1. ...

### Required next changes
1. ...
2. ...

### Non-blocking observations
- ...

### Specialist findings considered
- QA: ...
- Security: ...
- DevOps: ...
- API Contract: ...

### Recommended next step
- Builder should ...
```

For machine-readable orchestration, this should eventually also produce JSON:

```json
{
  "merge_readiness": "blocked | ready_with_notes | ready",
  "goal_satisfied": true,
  "blocking_findings": [],
  "required_changes": [],
  "optional_followups": [],
  "recommended_next_actor": "human | implementer | qa | security | devops | api-contract",
  "summary": "..."
}
```

---

## Agent roster

### Router

The Router should be deterministic where possible.

Responsibilities:

- Parse slash commands.
- Identify issue vs PR context.
- Select agents based on command, changed files, plan metadata, and risk rules.
- Avoid unnecessary agent runs.

This should not be an LLM by default. LLM routers are useful only for borderline cases. In most cases, a file glob and risk map will outperform a poetic probability machine.

### Project Lead

Responsibilities:

- Issue-stage planning.
- Scope clarification.
- Acceptance criteria.
- Risk identification.
- Reviewer recommendations.
- PR-stage synthesis after specialist reviews.
- Merge-readiness assessment.
- Next-step planning for the builder/implementer.

Should not:

- Pretend to be a security approver.
- Approve its own generated code as final authority.
- Treat every minor comment as a blocker.

### Implementer / Builder

Not fully implemented yet, but likely future role.

Responsibilities:

- Execute an approved plan.
- Make bounded code changes.
- Run relevant tests where possible.
- Open or update PRs.
- Respond to required changes from Project Lead synthesis.

Invocation should be explicit, likely via `/implement`, and should not be triggered automatically by `/plan`.

### QA Agent

Responsibilities:

- Identify missing or weak tests.
- Check behavioural edge cases.
- Assess whether acceptance criteria are testable and covered.
- Review CI/test evidence.
- Flag regressions or untested behaviour.

Should prioritise actionable test gaps over generic “add more tests” sludge.

### Security Agent

Responsibilities:

- Escalate risk.
- Identify secrets, auth issues, dependency risks, dangerous shell/network execution, unsafe deserialisation, workflow permission problems, public API exposure, and data handling issues.
- Request deterministic evidence where needed.

Should never:

- Approve merge.
- Claim to certify security.
- Push fixes autonomously unless explicitly authorised in a future controlled flow.

The Security Agent is a risk escalator, not a magical compliance talisman.

### DevOps Agent

Responsibilities:

- Review GitHub Actions workflows.
- Review CI/CD changes.
- Review Docker/container/runtime/deployment config.
- Review environment variable and secret handling.
- Review build and release scripts.

### API Contract Agent

Responsibilities:

- Review public interfaces.
- Review OpenAPI/schema/GraphQL changes.
- Check backward compatibility.
- Identify breaking API changes.
- Check SDK/client contract impacts.

### Evidence Summariser

Recommended future role or stage.

Responsibilities:

- Consume GitHub Checks, CI logs, test results, linting, code scanning, and secret scanning outputs.
- Produce a normalised evidence object.
- Feed concise evidence into review agents.

This avoids feeding every agent a wall of CI logs, because apparently humans invented logs and then immediately made them unreadable.

---

## Recommended command set

Keep commands small and composable.

Existing:

- `/plan`
- `/review`
- `/review all`
- `/review lead`
- `/review qa`
- `/review security`
- `/review devops`
- `/review api-contract`

Recommended additions:

- `/implement`
- `/status`
- `/cost`

### `/implement`

Should be an explicit transition from an approved plan to code changes.

It should require:

- Existing plan
- Human command
- Scope boundaries
- Clear acceptance criteria
- Risk flags checked

### `/status`

Should summarise:

- Current plan state
- Selected reviewers
- CI/check state
- Open findings
- Merge readiness
- Next actor

### `/cost`

Should summarise:

- Provider/model usage
- Token usage where available
- Runtime
- GitHub Actions minutes
- Cost estimate if available
- Command/run breakdown

---

## Plan object

A major next step is to formalise the **Plan object**.

The plan should exist in two forms:

1. Human-readable GitHub issue comment
2. Machine-readable JSON stored as an artifact, hidden comment marker, or other durable mechanism

Suggested fields:

```json
{
  "plan_id": "string",
  "issue_number": 123,
  "title": "string",
  "summary": "string",
  "scope": {
    "in_scope": [],
    "out_of_scope": []
  },
  "acceptance_criteria": [],
  "impacted_areas": [],
  "risk_flags": [],
  "requested_reviewers": [
    "qa",
    "security",
    "devops",
    "api-contract"
  ],
  "expected_tests": [],
  "implementation_notes": [],
  "open_questions": [],
  "created_by": "project-lead",
  "created_at": "ISO-8601 timestamp"
}
```

The review workflow should be plan-aware. Reviewers should judge the PR against the plan and acceptance criteria, not just wander through the diff pointing at whatever makes them feel clever.

---

## Routing rules

Routing should combine:

- Explicit user command
- Changed-file globs
- Plan-requested reviewers
- Risk heuristics

### Suggested deterministic routing

Always run Project Lead for:

- `/plan`
- Final review synthesis after specialist review when `/review` is run on a PR

Run QA when:

- Tests changed
- Behaviour-heavy code changed
- Diff is large
- Plan requested QA
- Acceptance criteria are not obviously covered by tests
- New functionality has no corresponding test changes

Run Security when:

- Auth code changes
- Permission code changes
- Secrets/config changes
- Dependency files change
- GitHub Actions/workflow files change
- Infrastructure-as-code changes
- Network, shell, file system, or deserialisation surfaces change
- Public endpoint or data-handling changes occur
- Plan requested Security

Run DevOps when:

- `.github/workflows/**` changes
- Docker/container files change
- Build scripts change
- Deployment/runtime/config files change
- CI/CD scripts change
- Plan requested DevOps

Run API Contract when:

- OpenAPI files change
- GraphQL schemas change
- Public API route/controller/interface files change
- SDK/client contract files change
- Database schema changes affect exposed API behaviour
- Plan requested API Contract

---

## Review workflow proposal

Recommended flow for `/review` on a PR:

1. Parse command.
2. Identify PR and changed files.
3. Load associated issue and Plan object if available.
4. Determine reviewer set.
5. Run specialist reviewers first.
6. Collect outputs in structured form.
7. Run Project Lead synthesis last.
8. Post individual specialist comments if useful.
9. Post final Project Lead summary.
10. Optionally update status/check output with merge readiness.

The key design point: **Project Lead should not merely add another independent review. It should synthesise.**

---

## Merge readiness model

EPIC should use advisory merge readiness states.

Suggested states:

- `READY`
- `READY_WITH_NOTES`
- `BLOCKED`
- `NEEDS_HUMAN_DECISION`
- `INSUFFICIENT_EVIDENCE`

### READY

The PR appears to satisfy the plan, no blocking specialist issues remain, and available evidence is adequate.

### READY_WITH_NOTES

The PR appears mergeable, but there are minor follow-ups or non-blocking observations.

### BLOCKED

There are concrete required changes before merge.

### NEEDS_HUMAN_DECISION

The PR involves ambiguous product, architecture, security, or scope decisions that the agents should not decide.

### INSUFFICIENT_EVIDENCE

The PR may be fine, but tests/checks/evidence are missing or inconclusive.

The human still owns actual merge. EPIC can advise, not grant divine blessing from the cloud.

---

## Security model and guardrails

Security must be treated as a core design constraint, not an afterthought to sprinkle on later like parsley over a kitchen fire.

### Immediate GitHub Actions hardening

Implement or verify:

- Minimum `GITHUB_TOKEN` permissions by default.
- Read-only permissions for analysis jobs where possible.
- Separate read-only jobs from write-capable comment/posting jobs.
- Do not checkout untrusted fork PR code in privileged `pull_request_target` or `workflow_run` contexts.
- Pin third-party actions to immutable SHAs.
- Avoid exposing secrets to review-only jobs.
- Require explicit human approval before jobs that can write code, change workflows, touch deployment config, or affect infrastructure.

### Threat model

Treat all of the following as untrusted input:

- Repo files
- Issue bodies
- PR comments
- Commit messages
- CI logs
- Test output
- External documents
- Tool output
- Model output from another agent

Prompt injection is a real concern. Repo text should be context, not authority.

### Principle

Only system/developer instructions and explicit trusted workflow config should control agent behaviour. Everything from the repo or GitHub conversation should be treated as data to inspect.

---

## Provider strategy

Current prototype uses GitHub Models via `GITHUB_TOKEN`.

This is fine for now.

However, the architecture should avoid hard-coding the workflow to one provider.

Recommended near-term abstraction:

```ts
interface ModelProvider {
  name: string;
  runAgent(input: AgentRunInput): Promise<AgentRunResult>;
}
```

A simple mapping is enough:

```json
{
  "projectLead": {
    "provider": "github-models",
    "model": "..."
  },
  "qa": {
    "provider": "github-models",
    "model": "..."
  },
  "security": {
    "provider": "github-models",
    "model": "..."
  }
}
```

Possible future integrations:

- GitHub Models
- Claude Code / Claude Code GitHub Actions
- OpenAI Codex GitHub review / Codex CLI
- Aider-style implementation flow
- OpenHands-style sandboxed runtime
- Other provider-specific tools if they prove useful

Do not over-abstract yet. Build enough to swap model/provider per role and log usage. Anything more is architecture cosplay until the prototype hurts enough to justify it.

---

## Repository context and memory

Durable knowledge should live in files, not in chat history.

Recommended repo context files:

- `AGENTS.md` or equivalent
- `CLAUDE.md` if using Claude Code heavily
- Project architecture notes
- Agent role definitions
- Review policy/routing config
- Security policy for agent workflows

The agents should be instructed to read these files when relevant.

Avoid letting important workflow state exist only in long comment threads. GitHub comments are useful for humans, but machine-readable state should be stored in structured artifacts, hidden markers, or committed config where appropriate.

---

## Evaluation metrics

Track whether EPIC improves useful engineering outcomes.

Good metrics:

- Plan usefulness score from the human lead
- Percentage of planned tasks that reach a PR
- Percentage of PRs with first-pass CI green
- Review precision: validated findings / total findings
- Fix acceptance rate for review comments
- Human review time saved or added
- Reopened defect rate after merge
- Rollback rate after merge
- Cost per useful plan
- Cost per useful review
- Cost per merged PR
- Escalation rate on ambiguous tasks
- Security gate hits by class

Bad metrics:

- Total agent comments
- Total PRs opened
- Lines of code written by AI
- Number of agents involved
- Number of tokens burned in the sacred furnace

---

## Near-term implementation roadmap

### Priority 1: Clarify Project Lead behaviour

Update the Project Lead prompt and workflow role so that:

- In `/plan`, it creates structured plans.
- In `/review`, it runs after specialists.
- It synthesises specialist findings.
- It determines merge readiness.
- It produces required next changes if blocked.
- It distinguishes blockers from optional notes.

### Priority 2: Formalise Plan object

Add a schema for the Plan object.

Use the schema in:

- `/plan` output
- `/review` context loading
- reviewer routing
- Project Lead synthesis

### Priority 3: Improve routing

Implement deterministic routing with:

- Changed-file globs
- Plan-requested reviewers
- Explicit command overrides
- Risk flags

### Priority 4: Add structured agent outputs

Each agent should produce both:

- Human-readable markdown
- Machine-readable JSON summary

Suggested specialist output schema:

```json
{
  "agent": "qa | security | devops | api-contract",
  "status": "pass | concerns | blocked | needs_human",
  "findings": [
    {
      "severity": "blocking | warning | note",
      "title": "string",
      "description": "string",
      "evidence": "string",
      "recommended_action": "string"
    }
  ],
  "summary": "string"
}
```

### Priority 5: Add evidence summarisation

Create a cheap/deterministic evidence collection stage that gathers:

- CI status
- Test results
- Lint results
- Code scanning results
- Secret scanning results where available
- Changed file summary

Feed this to review agents and Project Lead.

### Priority 6: Add cost logging

Log per run:

- Command
- Agent
- Provider
- Model
- Runtime
- Token usage if available
- Estimated cost if available
- GitHub Actions run ID

Expose through `/cost` later.

### Priority 7: Security hardening

Review workflows for:

- Token permissions
- `pull_request_target` usage
- Secret exposure
- Third-party action pinning
- Privileged checkout patterns
- Write-capable job isolation

---

## Recommended prompt direction

### Project Lead `/plan` prompt should emphasise

- Turn issue into implementation plan.
- Identify scope boundaries.
- Define acceptance criteria.
- Identify risk areas.
- Recommend specialist reviewers.
- State expected tests/checks.
- Ask for human clarification only when ambiguity blocks planning.

### Project Lead `/review` prompt should emphasise

- You are the coordinator, not another specialist reviewer.
- Assess the PR against the original issue and Plan object.
- Read specialist findings and decide what blocks merge.
- Identify required changes for the builder.
- Identify optional follow-ups separately.
- Produce merge readiness.
- Escalate ambiguous architectural/product/security decisions to the human.

### Specialist reviewer prompts should emphasise

- Focus only on your domain.
- Prefer high-signal findings.
- Avoid generic advice.
- Classify severity.
- Provide evidence.
- State whether each finding is blocking.
- Do not approve merge.

---

## Suggested implementation tasks for Claude Code / Cowork

A good first implementation pass would be:

1. Locate the existing command parsing and review orchestration code.
2. Identify how `/review` currently selects and runs agents.
3. Modify the review flow so specialist agents run before Project Lead synthesis.
4. Add or update Project Lead prompt for review-stage synthesis.
5. Add structured output parsing or at least structured markdown conventions.
6. Add merge readiness states to Project Lead output.
7. Ensure `/review lead` still works as an explicit command, but default `/review` should use Project Lead as final aggregator when multiple reviewers run.
8. Preserve existing commands and avoid breaking current manual flows.
9. Add tests or fixture-based checks for routing behaviour if the repo has test infrastructure.
10. Update README/docs with the new Project Lead role.

Suggested second pass:

1. Add Plan object schema.
2. Update `/plan` to emit machine-readable plan metadata.
3. Update `/review` to load plan metadata.
4. Use plan metadata in reviewer routing.
5. Add `/status` skeleton.
6. Add cost logging skeleton.

---

## Behavioural expectations for implementation agents

When working on this codebase:

- Prefer small, reviewable changes.
- Preserve the current GitHub Actions prototype architecture.
- Do not introduce a backend service unless explicitly asked.
- Do not replace the current workflow wholesale.
- Do not add unnecessary agent roles.
- Do not make agents auto-merge PRs.
- Do not grant write permissions broadly.
- Treat safety and governance as first-class constraints.
- Keep outputs concise enough to be useful in GitHub comments.
- Add structured data where it enables routing, status, or later automation.

---

## Open design questions

These are not fully settled yet:

1. Should EPIC eventually allow auto-merge for very low-risk PRs, or should all merge authority remain human forever?
2. Should `/implement` use Claude Code, GitHub Models, Codex, or a provider abstraction from the start?
3. Where should machine-readable Plan objects be stored: artifacts, hidden comments, committed files, issue metadata, or check outputs?
4. Should specialist reviews be posted as separate comments, collapsed into one report, or both?
5. How strict should Project Lead be when evidence is missing but the code looks correct?
6. Should EPIC create GitHub check runs for merge readiness, or only comments for now?

Current bias:

- Keep merge authority human.
- Keep implementation explicit.
- Store structured state durably but simply.
- Use GitHub comments/checks before building a backend.
- Make the Project Lead a synthesiser, not a noisy reviewer.

---

## Research findings that should influence design

The research phase found that EPIC occupies a specific niche:

> GitHub-native, human-governed orchestration for agentic software engineering.

Adjacent systems include:

- GitHub Copilot cloud agent
- GitHub Agentic Workflows
- OpenAI Codex GitHub review
- Claude Code GitHub Actions
- Cursor Cloud Agents and Bugbot
- CodeRabbit
- PR-Agent
- Aider
- OpenHands
- SWE-agent
- AutoCodeRover
- LangGraph
- OpenAI Agents SDK
- AutoGen
- CrewAI Flows

Key conclusions from the research:

- Keep EPIC GitHub-first and Actions-based for now.
- Use deterministic routing and bounded specialist reviewers.
- Do not create an always-on swarm of agents.
- Use structured plans and evidence-aware review.
- Treat prompt injection and GitHub Actions permissions as serious risks.
- Track cost and usefulness, not output volume.
- Use durable repo instruction files rather than chat memory.
- Frameworks like LangGraph or Agents SDK may be useful later, but are unnecessary for the current prototype unless state durability and tracing become painful.

---

## Mental model for Claude Code / Cowork

Think of EPIC as a workflow engine around coding agents, not as a coding agent itself.

The core product is the **discipline around the agent**:

- What context it sees
- Who acts when
- What gets routed to whom
- What counts as evidence
- What blocks merge
- When humans must decide
- How cost and usefulness are measured

The implementation should therefore improve orchestration, structure, and safety before chasing bigger autonomy.

The correct next version is not “more agents.”

The correct next version is:

- Better Project Lead coordination
- Structured Plan objects
- Selective review routing
- Evidence-aware synthesis
- Clear next-step generation
- Safer GitHub Actions execution

That is the path from “interesting prototype” to “actually useful engineering tool,” which is apparently the difficult bit humanity keeps trying to outsource to autocomplete.
