const assert = require("assert");

const {
  BUDGETS,
  buildPlanPrompt,
  formatComments,
  formatFiles,
  relevantHumanComments,
  truncateText,
} = require("./build-plan-prompt");

function human(login, created_at, body) {
  return {
    user: { login, type: "User" },
    created_at,
    body,
  };
}

function bot(login, created_at, body) {
  return {
    user: { login, type: "Bot" },
    created_at,
    body,
  };
}

function userPrompt(planPrompt) {
  return planPrompt.messages.find((message) => message.role === "user").content;
}

function run() {
  assert.strictEqual(truncateText("abcdefghijklmnopqrstuvwxyz", 20), "abcdefgh\n[truncated]");

  const issuePrompt = userPrompt(buildPlanPrompt({
    repository: { full_name: "example/repo" },
    issue: {
      number: 7,
      title: "Add review command",
      body: "Issue body",
    },
  }));
  assert(issuePrompt.includes("Create a Project Lead plan for this GitHub issue."));
  assert(issuePrompt.includes("Issue number: 7"));
  assert(issuePrompt.includes("Issue body"));

  const comments = [
    human("alice", "2026-05-01T10:00:00Z", "please consider docs"),
    bot("github-actions", "2026-05-01T10:01:00Z", "bot output should not appear"),
    human("reviewer", "2026-05-01T10:02:00Z", "## AI PR Review\nold review"),
    human("lead", "2026-05-01T10:03:00Z", "## Project Lead Agent Plan\nold plan"),
  ];
  const relevant = relevantHumanComments(comments);
  assert.deepStrictEqual(relevant.map((comment) => comment.user.login), ["alice"]);

  const formattedComments = formatComments([
    human("alice", "2026-05-01T10:00:00Z", "a".repeat(BUDGETS.humanComment + 100)),
  ]);
  assert(formattedComments.includes("[truncated]"));

  const formattedFiles = formatFiles([
    {
      filename: "scripts/ai/build-plan-prompt.js",
      status: "modified",
      additions: 10,
      deletions: 2,
      patch: "+".repeat(BUDGETS.diffContext + 1000),
    },
  ]);
  assert(formattedFiles.endsWith("[truncated]"));

  const prPrompt = userPrompt(buildPlanPrompt({
    isPullRequest: true,
    repository: { full_name: "example/repo" },
    issueNumber: 12,
    pullRequest: {
      number: 12,
      title: "Extend planning to PRs",
      body: "Closes #7",
      user: { login: "author" },
      base: { ref: "dev" },
      head: { ref: "feat/pr-plan" },
    },
    files: [
      {
        filename: "scripts/ai/build-plan-prompt.js",
        status: "modified",
        additions: 5,
        deletions: 1,
        patch: "+change",
      },
    ],
    comments: [human("alice", "2026-05-01T10:00:00Z", "goal is review planning")],
  }));
  assert(prPrompt.includes("Create a concise PR-derived Project Lead plan"));
  assert(prPrompt.includes("Plan type: PR-derived"));
  assert(prPrompt.includes("Required reviewers:"));
  assert(prPrompt.includes("- Security: yes/no"));
  assert(prPrompt.includes("Pull request: #12"));
  assert(prPrompt.includes("scripts/ai/build-plan-prompt.js"));
  assert(prPrompt.includes("goal is review planning"));

  console.log("build-plan-prompt tests passed");
}

run();
