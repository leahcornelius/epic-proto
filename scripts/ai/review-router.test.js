const assert = require("assert");

const {
  routeReview,
} = require("./review-router");

const routingConfig = {
  security: ["**/auth.ts"],
  devops: [".github/**"],
  "api-contract": ["**/routes/**"],
};

function context(command, overrides = {}) {
  return {
    command,
    files: [],
    latestProjectLeadPlan: "",
    ...overrides,
  };
}

function ids(selection) {
  return selection.agents.map((agent) => agent.id);
}

function run() {
  const auto = routeReview(context("/review"), routingConfig);
  assert.strictEqual(auto.selector, "auto");
  assert.deepStrictEqual(ids(auto), ["qa"]);
  assert.strictEqual(auto.coordinator.id, "lead");

  const routed = routeReview(context("/review auto", {
    files: [{ filename: "src/auth.ts" }, { filename: ".github/workflows/ci.yml" }],
    latestProjectLeadPlan: "- API Contract - yes",
  }), routingConfig);
  assert.deepStrictEqual(ids(routed), ["qa", "security", "devops", "api-contract"]);
  assert.strictEqual(routed.coordinator.label, "Project Lead Coordinator");

  const leadOnly = routeReview(context("/review lead"), routingConfig);
  assert.deepStrictEqual(ids(leadOnly), []);
  assert.strictEqual(leadOnly.coordinator.reason, "Explicitly selected by /review lead.");

  const all = routeReview(context("/review all"), routingConfig);
  assert.deepStrictEqual(ids(all), ["qa", "security", "devops", "api-contract"]);
  assert.strictEqual(all.coordinator.id, "lead");

  const explicitSpecialist = routeReview(context("/review security"), routingConfig);
  assert.deepStrictEqual(ids(explicitSpecialist), ["security"]);
  assert.strictEqual(explicitSpecialist.coordinator.id, "lead");

  console.log("review-router tests passed");
}

run();
