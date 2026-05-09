const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  capStreams,
  loadConfig,
  normalizeCheck,
  parseCommand,
  runChecks,
} = require("./run-review-checks");

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "review-checks-"));

  assert.deepStrictEqual(parseCommand("npm run build"), ["npm", "run", "build"]);
  assert.deepStrictEqual(parseCommand('node "script with spaces.js"'), ["node", "script with spaces.js"]);
  assert.throws(() => parseCommand("npm test && echo unsafe"), /shell control/);
  assert.throws(() => parseCommand('node "unterminated'), /unmatched quotes/);
  assert.throws(() => parseCommand(""), /non-empty string/);

  const malformedJsonPath = path.join(tempDir, "malformed.json");
  fs.writeFileSync(malformedJsonPath, "{not json", "utf8");
  assert.throws(() => loadConfig(malformedJsonPath), /JSON/);

  const nonArrayPath = path.join(tempDir, "non-array.json");
  fs.writeFileSync(nonArrayPath, JSON.stringify({ checks: [] }), "utf8");
  assert.throws(() => loadConfig(nonArrayPath), /must be an array/);

  const missingFields = normalizeCheck({ name: "", command: "", workingDirectory: "", required: "yes" }, 0);
  assert.strictEqual(missingFields.valid, false);
  assert.match(missingFields.reason, /name must be/);
  assert.match(missingFields.reason, /command must be/);
  assert.match(missingFields.reason, /workingDirectory must be/);
  assert.match(missingFields.reason, /required must be/);

  const malformedCommand = normalizeCheck({
    name: "Unsafe command",
    command: "npm test && echo unsafe",
    workingDirectory: ".",
    required: true,
  }, 0);
  assert.strictEqual(malformedCommand.valid, false);
  assert.match(malformedCommand.reason, /shell control/);

  const invalidDirectory = normalizeCheck({
    name: "Bad path",
    command: "npm test",
    workingDirectory: "../outside",
    required: true,
  }, 0);
  assert.strictEqual(invalidDirectory.valid, false);
  assert.match(invalidDirectory.reason, /relative path inside the checkout/);

  const capped = capStreams("a".repeat(7000), "b".repeat(7000));
  assert.ok(capped.truncated);
  assert.ok(capped.stdout.length + capped.stderr.length <= 6000);
  assert.ok(capped.stdout.includes("[output truncated]"));

  const skipped = await runChecks([{ name: "Missing command", workingDirectory: ".", required: true }]);
  assert.strictEqual(skipped[0].status, "skipped");
  assert.strictEqual(skipped[0].required, true);
  assert.match(skipped[0].stderr, /config is invalid/);

  const passed = await runChecks([{ name: "Node version", command: "node -v", workingDirectory: ".", required: true }]);
  assert.strictEqual(passed[0].status, "passed");
  assert.strictEqual(passed[0].exitCode, 0);
  assert.match(passed[0].stdout, /^v\d+/);

  const failed = await runChecks([{ name: "Missing cwd", command: "node -v", workingDirectory: "missing-dir", required: false }]);
  assert.strictEqual(failed[0].status, "failed");
  assert.match(failed[0].stderr, /ENOENT|no such file|cannot find|spawn/i);

  console.log("run-review-checks tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
