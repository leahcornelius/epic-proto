const fs = require("fs");
const path = require("path");

const AGENT_FILES = {
  lead: ".ai/agents/review-lead.md",
  qa: ".ai/agents/review-qa.md",
  security: ".ai/agents/review-security.md",
  devops: ".ai/agents/review-devops.md",
  "api-contract": ".ai/agents/review-api-contract.md",
};

const BUDGETS = {
  prBody: 3000,
  projectLeadPlan: 2000,
  diffContext: 16000,
  checkOutput: 12000,
  humanComment: 1000,
  humanCommentsTotal: 4000,
  finalPrompt: 45000,
};

const TRUNCATED_MARKER = "[truncated]";
const TRUNCATED_SUFFIX = `\n${TRUNCATED_MARKER}`;
const PROJECT_LEAD_PLAN_HEADING = "## Project Lead Agent Plan";
const AI_PR_REVIEW_HEADING = "## AI PR Review";
const AI_REVIEW_HEADINGS = [
  AI_PR_REVIEW_HEADING,
  "Project Lead PR Review",
  "Security Agent PR Review",
  "QA PR Review",
  "### Project Lead",
  "### QA",
  "### Security",
  "### DevOps",
  "### API Contract",
];

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

  if (maxLength <= TRUNCATED_SUFFIX.length) {
    return TRUNCATED_MARKER.slice(0, maxLength);
  }

  return `${text.slice(0, maxLength - TRUNCATED_SUFFIX.length)}${TRUNCATED_SUFFIX}`;
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

function commentBody(comment) {
  return String(comment?.body || "");
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

function containsAnyHeading(body, headings) {
  return headings.some((heading) => body.includes(heading));
}

function containsAiReviewHeading(comment) {
  return containsAnyHeading(commentBody(comment), AI_REVIEW_HEADINGS);
}

function containsProjectLeadPlanHeading(comment) {
  return commentBody(comment).includes(PROJECT_LEAD_PLAN_HEADING);
}

function latestCommentMatching(comments, predicate) {
  return [...(comments || [])]
    .filter(predicate)
    .sort((a, b) => (commentCreatedAt(b) || 0) - (commentCreatedAt(a) || 0))[0];
}

function latestProjectLeadPlan(context) {
  if (context.latestProjectLeadPlan) {
    return context.latestProjectLeadPlan;
  }

  return commentBody(latestCommentMatching(context.comments, containsProjectLeadPlanHeading));
}

function relevantHumanComments(comments) {
  const latestAiReview = latestCommentMatching(
    comments,
    (comment) => commentBody(comment).includes(AI_PR_REVIEW_HEADING)
  );
  const latestAiReviewAt = commentCreatedAt(latestAiReview);
  const eligible = (comments || [])
    .filter((comment) => !isBotComment(comment))
    .filter((comment) => !containsAiReviewHeading(comment))
    .filter((comment) => !containsProjectLeadPlanHeading(comment));
  const afterLatestReview = latestAiReviewAt
    ? eligible.filter((comment) => {
      const createdAt = commentCreatedAt(comment);
      return createdAt && createdAt > latestAiReviewAt;
    })
    : [];

  return (afterLatestReview.length > 0 ? afterLatestReview : eligible)
    .sort((a, b) => (commentCreatedAt(a) || 0) - (commentCreatedAt(b) || 0));
}

function formatComments(comments) {
  const relevantComments = relevantHumanComments(comments);

  if (relevantComments.length === 0) {
    return "(No PR comments provided.)";
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

function estimatePromptLength(messages) {
  return messages.reduce((total, message) => total + String(message.content || "").length, 0);
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
  const planComment = latestProjectLeadPlan(context);
  const selectedReviewers = (selection.agents || [])
    .map((selectedAgent) => `${selectedAgent.label}: ${selectedAgent.reason || "No reason provided."}`)
    .join("\n");

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
    "Selected reviewers:",
    selectedReviewers || "(No selected reviewers provided.)",
    "",
    "Pull request body:",
    truncateText(pr.body || "(No pull request body provided.)", BUDGETS.prBody),
    "",
    "Latest Project Lead plan comment:",
    truncateText(planComment || "(No Project Lead plan comment found.)", BUDGETS.projectLeadPlan),
    "",
    "Changed files and patches:",
    formatFiles(files),
    "",
    "Recent issue/PR comments:",
    formatComments(context.comments || []),
    "",
    "Test/build output:",
    context.checkOutput
      ? truncateText(context.checkOutput, BUDGETS.checkOutput)
      : "(Unavailable. Do not invent test or build results.)",
  ].join("\n");

  const messages = [
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
  ];
  const estimatedPromptLength = estimatePromptLength(messages);

  return {
    id: agent.id,
    label: agent.label,
    reason: agent.reason,
    messages,
    estimatedPromptLength,
    exceededLocalContextBudget: estimatedPromptLength > BUDGETS.finalPrompt,
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
  AI_REVIEW_HEADINGS,
  BUDGETS,
  buildReviewPrompts,
  buildPromptForAgent,
  containsAiReviewHeading,
  formatComments,
  formatFiles,
  relevantHumanComments,
  truncateText,
};
