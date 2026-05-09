const assert = require("assert");
const {
  capStreams,
  normalizeCheck,
  parseCommand,
  runChecks,
} = require("./run-review-checks");

async function main() {
  assert.deepStrictEqual(parseCommand("npm run build"), ["npm", "run", "build"]);
  assert.deepStrictEqual(parseCommand('node "script with spaces.js"'), ["node", "script with spaces.js"]);
  assert.throws(() => parseCommand("npm test && echo unsafe"), /shell control/);

  const invalidDirectory = normalizeCheck({
    name: "Bad path",
    command: "npm test",
    workingDirectory: "../outside",
    required: true,
  }, 0);
  assert.strictEqual(invalidDirectory.valid, false);

  const capped = capStreams("a".repeat(7000), "b".repeat(7000));
  assert.ok(capped.truncated);
  assert.ok(capped.stdout.length + capped.stderr.length <= 6000);
  assert.ok(capped.stdout.includes("[output truncated]"));

  const skipped = await runChecks([{ name: "Missing command", workingDirectory: ".", required: true }]);
  assert.strictEqual(skipped[0].status, "skipped");
  assert.strictEqual(skipped[0].required, true);

  const passed = await runChecks([{ name: "Node version", command: "node -v", workingDirectory: ".", required: true }]);
  assert.strictEqual(passed[0].status, "passed");
  assert.strictEqual(passed[0].exitCode, 0);
  assert.match(passed[0].stdout, /^v\d+/);

  const failed = await runChecks([{ name: "Missing cwd", command: "node -v", workingDirectory: "missing-dir" }]);
  assert.strictEqual(failed[0].status, "failed");
  assert.match(failed[0].stderr, /ENOENT|no such file|cannot find|spawn/i);

  console.log("run-review-checks tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
