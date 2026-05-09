const fs = require("fs");
const path = require("path");

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

const event = eventPayload();
const issue = event.issue || {};
const repository = event.repository || {};

const agent = readText(".ai/agents/project-lead.md");
const projectSummary = readText(".ai/context/project-summary.md");
const codingStandards = readText(".ai/context/coding-standards.md");

const repoName = repository.full_name || process.env.GITHUB_REPOSITORY || "unknown";
const issueNumber = issue.number || "unknown";
const issueTitle = issue.title || "";
const issueBody = issue.body || "";

const userPrompt = [
  "Create a Project Lead plan for this GitHub issue.",
  "",
  `Repository: ${repoName}`,
  `Issue number: ${issueNumber}`,
  `Issue title: ${issueTitle}`,
  "",
  "Issue body:",
  issueBody || "(No issue body provided.)",
].join("\n");

const requestBody = {
  messages: [
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
  ],
};

process.stdout.write(`${JSON.stringify(requestBody, null, 2)}\n`);
