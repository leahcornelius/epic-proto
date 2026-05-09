const assert = require("assert");
const {
  MAX_TOTAL_CHECK_OUTPUT,
  buildReviewPrompts,
  formatCheckResults,
} = require("./build-review-prompt");

const checkResults = {
  checks: [
    {
      name: "Run tests",
      command: "npm test",
      workingDirectory: "workspace/toy-server",
      required: true,
      status: "failed",
      exitCode: 1,
      stdout: "x".repeat(20000),
      stderr: "",
      truncated: true,
    },
  ],
  executionError: null,
};

const formatted = formatCheckResults(checkResults);
assert.ok(formatted.length <= MAX_TOTAL_CHECK_OUTPUT);
assert.ok(formatted.includes("Required failed: 1"));
assert.ok(formatted.includes("Required skipped: 0"));
assert.ok(formatted.includes("[output truncated]"));

const skippedFormatted = formatCheckResults({
  checks: [{
    name: "Skipped check",
    command: "npm test",
    workingDirectory: "workspace/toy-server",
    required: true,
    status: "skipped",
    exitCode: null,
    stdout: "",
    stderr: "Checks skipped because this pull request comes from a fork.",
    truncated: false,
  }],
  executionError: null,
});
assert.ok(skippedFormatted.includes("Required failed: 0"));
assert.ok(skippedFormatted.includes("Required skipped: 1"));

const prompts = buildReviewPrompts({
  command: "/review qa",
  repository: { full_name: "owner/repo" },
  pullRequest: {
    number: 1,
    title: "Test PR",
    body: "Body",
    user: { login: "octo" },
    base: { ref: "dev" },
    head: { ref: "feature" },
  },
  files: [],
  comments: [],
  latestProjectLeadPlan: "",
  checkResults,
}, {
  selector: "qa",
  agents: [{ id: "qa", label: "QA", reason: "Explicitly selected." }],
});

const promptBody = prompts.agents[0].messages[1].content;
assert.ok(promptBody.includes("Check results:"));
assert.ok(promptBody.includes("Run tests"));
assert.ok(promptBody.includes("Required failed: 1"));

console.log("build-review-prompt tests passed");
