const assert = require("assert");

const {
  BUDGETS,
  buildPromptForCoordinator,
  buildPromptForAgent,
  formatSpecialistReviews,
  formatComments,
  formatFiles,
  relevantHumanComments,
  truncateText,
} = require("./build-review-prompt");

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

function baseSelection(agent) {
  return {
    selector: "lead",
    agents: [agent],
    coordinator: {
      id: "lead",
      label: "Project Lead Coordinator",
      reason: "Explicitly selected by /review lead.",
    },
  };
}

function baseAgent(overrides = {}) {
  return {
    id: "lead",
    label: "Project Lead",
    reason: "Explicitly selected by /review lead.",
    ...overrides,
  };
}

function baseContext(overrides = {}) {
  return {
    repository: { full_name: "example/repo" },
    issueNumber: 12,
    pullRequest: {
      number: 12,
      title: "Improve review prompts",
      body: "PR body",
      user: { login: "author" },
      base: { ref: "dev" },
      head: { ref: "feature" },
    },
    files: [
      {
        filename: "src/app.js",
        status: "modified",
        additions: 1,
        deletions: 1,
        patch: "+change",
      },
    ],
    comments: [],
    ...overrides,
  };
}

function userPrompt(agentPrompt) {
  return agentPrompt.messages.find((message) => message.role === "user").content;
}

function run() {
  assert.strictEqual(truncateText("abcdefghijklmnopqrstuvwxyz", 20), "abcdefgh\n[truncated]");
  assert.strictEqual(truncateText("abcdef", 20), "abcdef");

  const comments = [
    human("alice", "2026-05-01T10:00:00Z", "old human feedback"),
    bot("github-actions", "2026-05-01T10:01:00Z", "bot output should not appear"),
    human("reviewer", "2026-05-01T10:02:00Z", "## AI PR Review\nold model review"),
    human("lead", "2026-05-01T10:03:00Z", "Project Lead PR Review\nlegacy heading"),
    human("bob", "2026-05-01T10:04:00Z", "new human feedback"),
  ];
  const relevant = relevantHumanComments(comments);
  assert.deepStrictEqual(relevant.map((comment) => comment.user.login), ["bob"]);

  const formattedComments = formatComments([
    human("alice", "2026-05-01T10:00:00Z", "a".repeat(BUDGETS.humanComment + 100)),
  ]);
  assert(formattedComments.includes("[truncated]"));
  assert(formattedComments.length < BUDGETS.humanCommentsTotal);

  const formattedManyComments = formatComments(
    Array.from({ length: 10 }, (_, index) => human(
      `human-${index}`,
      `2026-05-01T10:${String(index).padStart(2, "0")}:00Z`,
      "b".repeat(900)
    ))
  );
  assert(formattedManyComments.endsWith("[truncated]"));
  assert(formattedManyComments.length <= BUDGETS.humanCommentsTotal);

  const formattedFiles = formatFiles([
    {
      filename: "large.diff",
      status: "modified",
      additions: 100,
      deletions: 0,
      patch: "+".repeat(BUDGETS.diffContext + 1000),
    },
  ]);
  assert(formattedFiles.endsWith("[truncated]"));
  assert(formattedFiles.length <= BUDGETS.diffContext);

  const longPlan = "## Project Lead Agent Plan\n" + "p".repeat(BUDGETS.projectLeadPlan + 1000);
  const prompt = buildPromptForAgent(baseAgent(), baseContext({
    comments: [
      bot("project-lead-agent", "2026-05-01T10:05:00Z", longPlan),
      bot("review-bot", "2026-05-01T10:06:00Z", "bot-only context"),
      human("carol", "2026-05-01T10:07:00Z", "human context"),
    ],
    checkOutput: "c".repeat(BUDGETS.checkOutput + 1000),
  }), baseSelection(baseAgent()));
  const promptText = userPrompt(prompt);
  assert(promptText.includes("## Project Lead Agent Plan"));
  assert(promptText.includes("[truncated]"));
  assert(!promptText.includes("bot-only context"));
  assert(promptText.includes("human context"));
  assert(promptText.includes("c".repeat(100)));

  const oversizedAgent = baseAgent({ reason: "r".repeat(BUDGETS.finalPrompt + 1000) });
  const oversizedPrompt = buildPromptForAgent(
    oversizedAgent,
    baseContext(),
    baseSelection(oversizedAgent)
  );
  assert(oversizedPrompt.estimatedPromptLength > BUDGETS.finalPrompt);
  assert.strictEqual(oversizedPrompt.exceededLocalContextBudget, true);

  const specialistReviews = formatSpecialistReviews([
    { id: "qa", label: "QA", content: "Decision: REQUEST_CHANGES\nFindings:\n- Missing assertion." },
  ]);
  assert(specialistReviews.includes("### QA"));
  assert(specialistReviews.includes("Missing assertion."));

  const coordinatorPrompt = buildPromptForCoordinator(
    {
      id: "lead",
      label: "Project Lead Coordinator",
      reason: "Explicitly selected by /review lead.",
    },
    baseContext({
      specialistReviews: [
        { id: "qa", label: "QA", content: "Decision: COMMENT_ONLY\nFindings:\n- Optional polish." },
      ],
    }),
    baseSelection(baseAgent())
  );
  const coordinatorPromptText = userPrompt(coordinatorPrompt);
  assert(coordinatorPromptText.includes("Coordinate this pull request review as Project Lead Coordinator."));
  assert(coordinatorPromptText.includes("Specialist review outputs:"));
  assert(coordinatorPromptText.includes("Optional polish."));

  console.log("build-review-prompt tests passed");
}

run();
