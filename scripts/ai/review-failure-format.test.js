const assert = require("assert");

const {
  ReviewFailure,
  createModelRequestFailure,
  formatReviewFailure,
  workflowRunUrl,
} = require("./review-failure-format");

function response({ status, statusText, body }) {
  return {
    status,
    statusText,
    async text() {
      return body;
    },
  };
}

async function run() {
  const jsonFailure = await createModelRequestFailure(response({
    status: 429,
    statusText: "Too Many Requests",
    body: JSON.stringify({
      error: {
        code: "rate_limit_exceeded",
        message: "Rate limit exceeded",
      },
    }),
  }));
  const jsonComment = formatReviewFailure(jsonFailure, {
    logsUrl: "https://github.com/leahcornelius/epic-proto/actions/runs/12345",
  });

  assert(jsonComment.includes("Failed step: Call GitHub Models"));
  assert(jsonComment.includes("Failed operation: GitHub Models chat completion request"));
  assert(jsonComment.includes("Error code: 429"));
  assert(jsonComment.includes("HTTP status: 429 Too Many Requests"));
  assert(jsonComment.includes("Provider error code: rate_limit_exceeded"));
  assert(jsonComment.includes("Error message: Rate limit exceeded"));
  assert(jsonComment.includes("Workflow logs: https://github.com/leahcornelius/epic-proto/actions/runs/12345"));
  assert(jsonComment.includes("Decision: COMMENT_ONLY"));

  const textFailure = await createModelRequestFailure(response({
    status: 500,
    statusText: "Internal Server Error",
    body: "upstream unavailable",
  }));
  const textComment = formatReviewFailure(textFailure, { logsUrl: "https://example.test/run" });
  assert(textComment.includes("Error code: 500"));
  assert(textComment.includes("Error message: upstream unavailable"));

  const emptyFailure = new ReviewFailure({
    step: "Parse GitHub Models response",
    operation: "Read assistant message content",
    message: "GitHub Models returned an empty response.",
  });
  const emptyComment = formatReviewFailure(emptyFailure, { logsUrl: "https://example.test/run" });
  assert(emptyComment.includes("Failed step: Parse GitHub Models response"));
  assert(emptyComment.includes("Failed operation: Read assistant message content"));
  assert(emptyComment.includes("Error code: unavailable"));
  assert(emptyComment.includes("Error message: GitHub Models returned an empty response."));

  const budgetFailure = new ReviewFailure({
    step: "Local prompt validation",
    operation: "Review prompt context budget check",
    code: "LOCAL_CONTEXT_BUDGET_EXCEEDED",
    message: "Prompt exceeded local context budget (45001 > 45000 characters).",
  });
  const budgetComment = formatReviewFailure(budgetFailure, { logsUrl: "https://example.test/run" });
  assert(budgetComment.includes("Failed step: Local prompt validation"));
  assert(budgetComment.includes("Failed operation: Review prompt context budget check"));
  assert(budgetComment.includes("Error code: LOCAL_CONTEXT_BUDGET_EXCEEDED"));

  assert.strictEqual(workflowRunUrl({
    GITHUB_SERVER_URL: "https://github.com",
    GITHUB_REPOSITORY: "leahcornelius/epic-proto",
    GITHUB_RUN_ID: "98765",
  }), "https://github.com/leahcornelius/epic-proto/actions/runs/98765");

  console.log("review-failure-format tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
