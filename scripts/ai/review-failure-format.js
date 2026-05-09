const DEFAULT_STEP = "Call GitHub Models";
const DEFAULT_OPERATION = "GitHub Models chat completion request";
const UNKNOWN = "unavailable";
const MAX_MESSAGE_LENGTH = 500;

class ReviewFailure extends Error {
  constructor({
    message,
    step = DEFAULT_STEP,
    operation = DEFAULT_OPERATION,
    code,
    status,
    statusText,
  }) {
    super(message || "Review failed.");
    this.name = "ReviewFailure";
    this.step = step;
    this.operation = operation;
    this.code = code;
    this.status = status;
    this.statusText = statusText;
  }
}

function truncateMessage(value, maxLength = MAX_MESSAGE_LENGTH) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 15).trimEnd()}... [truncated]`;
}

function parseFailureBody(body) {
  const text = String(body || "").trim();
  if (!text) {
    return {};
  }

  try {
    const parsed = JSON.parse(text);
    const error = parsed.error || parsed;
    return {
      code: error.code || parsed.code,
      message: error.message || parsed.message || text,
    };
  } catch (_error) {
    return {
      message: text,
    };
  }
}

async function createModelRequestFailure(response) {
  const body = await response.text();
  const parsed = parseFailureBody(body);
  const statusCode = response.status ? String(response.status) : undefined;
  const error = new ReviewFailure({
    message: truncateMessage(parsed.message || body || response.statusText || "GitHub Models request failed."),
    code: statusCode || parsed.code,
    status: response.status,
    statusText: response.statusText,
  });

  if (parsed.code && parsed.code !== error.code) {
    error.providerCode = parsed.code;
  }

  return error;
}

function workflowRunUrl(env = process.env) {
  if (!env.GITHUB_SERVER_URL || !env.GITHUB_REPOSITORY || !env.GITHUB_RUN_ID) {
    return "";
  }
  return `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
}

function formatReviewFailure(error, options = {}) {
  const logsUrl = options.logsUrl || workflowRunUrl(options.env);
  const code = error.status ? String(error.status) : error.code || UNKNOWN;
  const lines = [
    "Review failed for this agent.",
    "",
    `Failed step: ${error.step || DEFAULT_STEP}`,
    `Failed operation: ${error.operation || DEFAULT_OPERATION}`,
    `Error code: ${code}`,
  ];

  if (error.status && error.statusText) {
    lines.push(`HTTP status: ${error.status} ${error.statusText}`);
  }

  if (error.providerCode) {
    lines.push(`Provider error code: ${error.providerCode}`);
  }

  lines.push(`Error message: ${truncateMessage(error.message) || UNKNOWN}`);

  if (logsUrl) {
    lines.push("", `Workflow logs: ${logsUrl}`);
  }

  lines.push("", "Decision: COMMENT_ONLY");
  return lines.join("\n");
}

module.exports = {
  ReviewFailure,
  createModelRequestFailure,
  formatReviewFailure,
  parseFailureBody,
  workflowRunUrl,
};
