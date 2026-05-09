const fs = require("fs");
const path = require("path");

const AGENTS = {
  lead: { label: "Project Lead", aliases: ["lead"] },
  qa: { label: "QA", aliases: ["qa"] },
  security: { label: "Security", aliases: ["security"] },
  devops: { label: "DevOps", aliases: ["devops"] },
  "api-contract": { label: "API Contract", aliases: ["api-contract", "api"] },
};

const EXPLICIT_SELECTORS = new Map(
  Object.entries(AGENTS).flatMap(([id, agent]) => agent.aliases.map((alias) => [alias, id]))
);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), relativePath), "utf8").replace(/^\uFEFF/, ""));
}

function normalizePath(filePath) {
  return String(filePath || "").replace(/\\/g, "/");
}

function escapeRegex(value) {
  return value.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

function globToRegExp(pattern) {
  const normalized = normalizePath(pattern);
  let source = "";

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];

    if (char === "*" && next === "*") {
      const after = normalized[index + 2];
      if (after === "/") {
        source += "(?:.*/)?";
        index += 2;
      } else {
        source += ".*";
        index += 1;
      }
      continue;
    }

    if (char === "*") {
      source += "[^/]*";
      continue;
    }

    source += escapeRegex(char);
  }

  return new RegExp(`^${source}$`, "i");
}

function matchesAnyPattern(filePath, patterns) {
  const normalized = normalizePath(filePath);
  return patterns.some((pattern) => globToRegExp(pattern).test(normalized));
}

function parseReviewCommand(body) {
  const firstLine = String(body || "").trim().split(/\r?\n/, 1)[0].trim().toLowerCase();
  const tokens = firstLine.split(/\s+/);
  if (tokens[0] !== "/review") {
    return { valid: false, selector: null };
  }

  const candidate = tokens[1];
  const selector = candidate && (candidate === "all" || candidate === "auto" || EXPLICIT_SELECTORS.has(candidate))
    ? candidate
    : "auto";

  return { valid: true, selector };
}

function latestPlanRequests(planBody) {
  const lines = String(planBody || "")
    .toLowerCase()
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s*-]+/, "").trim());

  function lineRequests(labelPattern) {
    return lines.some((line) => labelPattern.test(line) && /\s*[-—]\s*yes\b/.test(line));
  }

  return {
    security: lineRequests(/^security\b/),
    devops: lineRequests(/^devops\b/),
    "api-contract": lineRequests(/^api contract\b/),
  };
}

function changedFileNames(context) {
  return (context.files || []).map((file) => normalizePath(file.filename || file.path || file.name));
}

function addSelection(selections, id, reason) {
  if (!AGENTS[id]) {
    throw new Error(`Unknown review agent: ${id}`);
  }

  if (!selections.some((selection) => selection.id === id)) {
    selections.push({ id, label: AGENTS[id].label, reason });
  }
}

function routeReview(context, routingConfig) {
  const command = parseReviewCommand(context.command || context.comment?.body || "");
  if (!command.valid) {
    throw new Error("Comment does not contain a supported /review command");
  }

  const selector = command.selector;
  const selections = [];

  if (selector === "all") {
    for (const id of Object.keys(AGENTS)) {
      addSelection(selections, id, "Explicitly selected by /review all.");
    }
    return { selector, agents: selections };
  }

  if (selector !== "auto") {
    const selectedAgent = EXPLICIT_SELECTORS.get(selector);
    if (!selectedAgent) {
      throw new Error(`Unsupported /review selector: ${selector}`);
    }

    addSelection(selections, selectedAgent, `Explicitly selected by /review ${selector}.`);
    return { selector, agents: selections };
  }

  addSelection(selections, "lead", "Project Lead always runs for auto-routing.");
  addSelection(selections, "qa", "QA always runs for auto-routing.");

  const files = changedFileNames(context);
  const planRequests = latestPlanRequests(context.latestProjectLeadPlan || "");

  for (const id of ["security", "devops", "api-contract"]) {
    const patterns = routingConfig[id] || [];
    const matchedFile = files.find((file) => matchesAnyPattern(file, patterns));

    if (matchedFile) {
      addSelection(selections, id, `Changed file matched ${id} routing: ${matchedFile}.`);
      continue;
    }

    if (planRequests[id]) {
      addSelection(selections, id, `Latest Project Lead plan requested ${AGENTS[id].label}.`);
    }
  }

  return { selector, agents: selections };
}

function main() {
  const contextPath = process.argv[2];
  if (!contextPath) {
    throw new Error("Usage: node scripts/ai/review-router.js <review-context.json>");
  }

  const context = JSON.parse(fs.readFileSync(contextPath, "utf8").replace(/^\uFEFF/, ""));
  const routingConfig = readJson(".ai/review-routing.json");
  process.stdout.write(`${JSON.stringify(routeReview(context, routingConfig), null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  AGENTS,
  parseReviewCommand,
  routeReview,
  globToRegExp,
  matchesAnyPattern,
  latestPlanRequests,
};
