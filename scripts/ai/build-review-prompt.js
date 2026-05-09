const fs = require("fs");
const path = require("path");

const AGENT_FILES = {
  lead: ".ai/agents/review-lead.md",
  qa: ".ai/agents/review-qa.md",
  security: ".ai/agents/review-security.md",
  devops: ".ai/agents/review-devops.md",
  "api-contract": ".ai/agents/review-api-contract.md",
};

const MAX_TOTAL_CHECK_OUTPUT = 12000;

function readText(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8").trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function truncateText(value, maxLength) {
  const text = String(value || "");
  if (text.length <= maxLength) {
    return text;
  }

  const marker = "\n[output truncated]";
  return `${text.slice(0, Math.max(0, maxLength - marker.length))}${marker}`;
}

function formatFile(file) {
  const filename = file.filename || file.path || "(unknown)";
  const summary = [
    `${filename}`,
    `status: ${file.status || "unknown"}`,
    `additions: ${file.additions ?? "unknown"}`,
    `deletions: ${file.deletions ?? "unknown"}`,
  ].join(", ");
  const patch = truncateText(file.patch || "(Patch unavailable.)", 4000);

  return [`### ${summary}`, "```diff", patch, "```"].join("\n");
}

function formatComments(comments) {
  if (!comments || comments.length === 0) {
    return "(No PR comments provided.)";
  }

  return comments
    .slice(-20)
    .map((comment) => {
      const author = comment.user?.login || comment.author || "unknown";
      const createdAt = comment.created_at || comment.createdAt || "unknown";
      return [`### ${author} at ${createdAt}`, truncateText(comment.body || "", 1200)].join("\n");
    })
    .join("\n\n");
}

function formatCheck(check) {
  const lines = [
    `### ${check.name || "(unnamed check)"}`,
    `Command: ${check.command || "(not configured)"}`,
    `Working directory: ${check.workingDirectory || "."}`,
    `Required: ${check.required ? "yes" : "no"}`,
    `Status: ${check.status || "unknown"}`,
    `Exit code: ${check.exitCode ?? "none"}`,
    "",
    "stdout:",
    check.stdout || "(empty)",
    "",
    "stderr:",
    check.stderr || "(empty)",
  ];

  if (check.truncated) {
    lines.push("", "[output truncated]");
  }

  return lines.join("\n");
}

function formatCheckResults(checkResults) {
  if (!checkResults) {
    return "(Unavailable. Do not invent test or build results.)";
  }

  if (checkResults.executionError) {
    return checkResults.executionError;
  }

  const checks = checkResults.checks || [];
  if (checks.length === 0) {
    return "(No configured checks ran.)";
  }

  return truncateText(checks.map(formatCheck).join("\n\n"), MAX_TOTAL_CHECK_OUTPUT);
}

function buildPromptForAgent(agent, context, selection) {
  const agentFile = AGENT_FILES[agent.id];
  if (!agentFile) {
    throw new Error(`No prompt file configured for review agent: ${agent.id}`);
  }

  const projectSummary = readText(".ai/context/project-summary.md");
  const codingStandards = readText(".ai/context/coding-standards.md");
  const agentPrompt = readText(agentFile);
  const pr = context.pullRequest || {};
  const repository = context.repository || {};
  const files = context.files || [];

  const userPrompt = [
    `Review this pull request as ${agent.label}.`,
    "",
    `Repository: ${repository.full_name || context.repositoryFullName || process.env.GITHUB_REPOSITORY || "unknown"}`,
    `Pull request: #${pr.number || context.issueNumber || "unknown"}`,
    `Title: ${pr.title || ""}`,
    `Author: ${pr.user?.login || pr.author || "unknown"}`,
    `Base branch: ${pr.base?.ref || pr.baseRef || "unknown"}`,
    `Head branch: ${pr.head?.ref || pr.headRef || "unknown"}`,
    `Selected because: ${agent.reason || "No reason provided."}`,
    "",
    "Pull request body:",
    truncateText(pr.body || "(No pull request body provided.)", 3000),
    "",
    "Latest Project Lead plan comment:",
    truncateText(context.latestProjectLeadPlan || "(No Project Lead plan comment found.)", 2500),
    "",
    "Changed files and patches:",
    files.length > 0 ? files.map(formatFile).join("\n\n") : "(No changed files provided.)",
    "",
    "Recent issue/PR comments:",
    formatComments(context.comments || []),
    "",
    "Check results:",
    formatCheckResults(context.checkResults),
  ].join("\n");

  return {
    id: agent.id,
    label: agent.label,
    reason: agent.reason,
    messages: [
      {
        role: "system",
        content: [
          agentPrompt,
          "",
          "Repository context:",
          projectSummary,
          "",
          "Coding standards:",
          codingStandards,
        ].join("\n"),
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
    selection,
  };
}

function buildReviewPrompts(context, selection) {
  return {
    selector: selection.selector,
    agents: selection.agents.map((agent) => buildPromptForAgent(agent, context, selection)),
  };
}

function main() {
  const contextPath = process.argv[2];
  const selectionPath = process.argv[3];
  if (!contextPath || !selectionPath) {
    throw new Error("Usage: node scripts/ai/build-review-prompt.js <review-context.json> <review-selection.json>");
  }

  const context = readJson(contextPath);
  const selection = readJson(selectionPath);
  process.stdout.write(`${JSON.stringify(buildReviewPrompts(context, selection), null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  MAX_TOTAL_CHECK_OUTPUT,
  buildReviewPrompts,
  buildPromptForAgent,
  formatCheckResults,
  truncateText,
};
