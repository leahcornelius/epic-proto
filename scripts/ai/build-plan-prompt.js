const fs = require("fs");
const path = require("path");

const BUDGETS = {
  prBody: 3000,
  diffContext: 16000,
  humanComment: 1000,
  humanCommentsTotal: 4000,
};

const TRUNCATED_MARKER = "[truncated]";
const TRUNCATED_SUFFIX = `\n${TRUNCATED_MARKER}`;
const PROJECT_LEAD_PLAN_HEADING = "## Project Lead Agent Plan";
const AI_PR_REVIEW_HEADING = "## AI PR Review";

function readText(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8").trim();
}

function eventPayload() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    throw new Error("GITHUB_EVENT_PATH is not set");
  }

  return JSON.parse(fs.readFileSync(eventPath, "utf8").replace(/^\uFEFF/, ""));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function truncateText(value, maxLength) {
  const text = String(value || "");
  if (text.length <= maxLength) {
    return text;
  }

  if (maxLength <= TRUNCATED_SUFFIX.length) {
    return TRUNCATED_MARKER.slice(0, maxLength);
  }

  return `${text.slice(0, maxLength - TRUNCATED_SUFFIX.length)}${TRUNCATED_SUFFIX}`;
}

function commentCreatedAt(comment) {
  const createdAt = comment?.created_at || comment?.createdAt || "";
  const timestamp = Date.parse(createdAt);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function isBotComment(comment) {
  const userType = comment?.user?.type || comment?.author?.type || comment?.author_type || comment?.authorType;
  return String(userType || "").toLowerCase() === "bot";
}

function containsGeneratedAiComment(comment) {
  const body = String(comment?.body || "");
  return body.includes(PROJECT_LEAD_PLAN_HEADING) || body.includes(AI_PR_REVIEW_HEADING);
}

function relevantHumanComments(comments) {
  return (comments || [])
    .filter((comment) => !isBotComment(comment))
    .filter((comment) => !containsGeneratedAiComment(comment))
    .sort((a, b) => (commentCreatedAt(a) || 0) - (commentCreatedAt(b) || 0));
}

function formatComments(comments) {
  const relevantComments = relevantHumanComments(comments);

  if (relevantComments.length === 0) {
    return "(No relevant human PR comments provided.)";
  }

  return truncateText(
    relevantComments
      .map((comment) => {
        const author = comment.user?.login || comment.author || "unknown";
        const createdAt = comment.created_at || comment.createdAt || "unknown";
        return [`### ${author} at ${createdAt}`, truncateText(comment.body || "", BUDGETS.humanComment)].join("\n");
      })
      .join("\n\n"),
    BUDGETS.humanCommentsTotal
  );
}

function formatFile(file) {
  const filename = file.filename || file.path || "(unknown)";
  const summary = [
    `${filename}`,
    `status: ${file.status || "unknown"}`,
    `additions: ${file.additions ?? "unknown"}`,
    `deletions: ${file.deletions ?? "unknown"}`,
  ].join(", ");
  const patch = file.patch || "(Patch unavailable.)";

  return [`### ${summary}`, "```diff", patch, "```"].join("\n");
}

function formatFiles(files) {
  if (!files || files.length === 0) {
    return "(No changed files provided.)";
  }

  return truncateText(files.map(formatFile).join("\n\n"), BUDGETS.diffContext);
}

function baseMessages(userPrompt) {
  const agent = readText(".ai/agents/project-lead.md");
  const projectSummary = readText(".ai/context/project-summary.md");
  const codingStandards = readText(".ai/context/coding-standards.md");

  return [
    {
      role: "system",
      content: [
        agent,
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
  ];
}

function buildIssuePrompt(context) {
  const issue = context.issue || {};
  const repository = context.repository || {};
  const repoName = repository.full_name || process.env.GITHUB_REPOSITORY || "unknown";
  const issueNumber = issue.number || "unknown";
  const issueTitle = issue.title || "";
  const issueBody = issue.body || "";

  return [
    "Create a Project Lead plan for this GitHub issue.",
    "",
    `Repository: ${repoName}`,
    `Issue number: ${issueNumber}`,
    `Issue title: ${issueTitle}`,
    "",
    "Issue body:",
    issueBody || "(No issue body provided.)",
  ].join("\n");
}

function buildPullRequestPrompt(context) {
  const pr = context.pullRequest || {};
  const repository = context.repository || {};
  const repoName = repository.full_name || process.env.GITHUB_REPOSITORY || "unknown";

  return [
    "Create a concise PR-derived Project Lead plan for this GitHub pull request.",
    "",
    "The plan will be used as review basis. Infer only from the PR title, body, changed files, patches, and relevant human comments.",
    "Do not block review if no linked issue exists.",
    "Ask explicit questions if the PR goal is unclear.",
    "Do not include the top-level heading; the workflow will add it.",
    "",
    "Use this exact response structure:",
    "Plan type: PR-derived",
    "Goal",
    "Expected scope",
    "Acceptance criteria",
    "Required reviewers:",
    "- Security: yes/no",
    "- QA: yes/no",
    "- DevOps: yes/no",
    "- API Contract: yes/no",
    "Open questions",
    "",
    `Repository: ${repoName}`,
    `Pull request: #${pr.number || context.issueNumber || "unknown"}`,
    `Title: ${pr.title || ""}`,
    `Author: ${pr.user?.login || pr.author || "unknown"}`,
    `Base branch: ${pr.base?.ref || pr.baseRef || "unknown"}`,
    `Head branch: ${pr.head?.ref || pr.headRef || "unknown"}`,
    "",
    "Pull request body:",
    truncateText(pr.body || "(No pull request body provided.)", BUDGETS.prBody),
    "",
    "Changed files and patches:",
    formatFiles(context.files || []),
    "",
    "Relevant human PR comments:",
    formatComments(context.comments || []),
  ].join("\n");
}

function buildPlanPrompt(context) {
  const userPrompt = context.isPullRequest || context.pullRequest
    ? buildPullRequestPrompt(context)
    : buildIssuePrompt(context);

  return { messages: baseMessages(userPrompt) };
}

function loadContext() {
  const contextPath = process.argv[2];
  if (contextPath && fs.existsSync(contextPath)) {
    return readJson(contextPath);
  }

  const event = eventPayload();
  return {
    isPullRequest: Boolean(event.issue?.pull_request),
    issue: event.issue || {},
    repository: event.repository || {},
  };
}

function main() {
  process.stdout.write(`${JSON.stringify(buildPlanPrompt(loadContext()), null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  BUDGETS,
  buildIssuePrompt,
  buildPlanPrompt,
  buildPullRequestPrompt,
  formatComments,
  formatFiles,
  relevantHumanComments,
  truncateText,
};
