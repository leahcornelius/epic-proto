const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const MAX_CHECK_OUTPUT = 6000;
const UNSAFE_COMMAND_CHARS = /[;&|<>`$(){}[\]\n\r]/;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function tryReadJson(filePath) {
  try {
    return fs.existsSync(filePath) ? readJson(filePath) : {};
  } catch (error) {
    return {};
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function truncate(value, maxLength) {
  const text = String(value || "");
  if (text.length <= maxLength) {
    return { text, truncated: false };
  }

  const marker = "\n[output truncated]";
  return { text: `${text.slice(0, Math.max(0, maxLength - marker.length))}${marker}`, truncated: true };
}

function capStreams(stdout, stderr) {
  const stdoutText = String(stdout || "");
  const stderrText = String(stderr || "");
  const halfLimit = Math.floor(MAX_CHECK_OUTPUT / 2);
  const stdoutLimit = stderrText.length > halfLimit ? halfLimit : MAX_CHECK_OUTPUT - stderrText.length;
  const stderrLimit = stdoutText.length > halfLimit ? halfLimit : MAX_CHECK_OUTPUT - Math.min(stdoutText.length, stdoutLimit);
  const cappedStdout = truncate(stdoutText, stdoutLimit);
  const cappedStderr = truncate(stderrText, stderrLimit);

  return {
    stdout: cappedStdout.text,
    stderr: cappedStderr.text,
    truncated: cappedStdout.truncated || cappedStderr.truncated,
  };
}

function parseCommand(command) {
  if (typeof command !== "string" || command.trim() === "") {
    throw new Error("Check command must be a non-empty string.");
  }

  if (UNSAFE_COMMAND_CHARS.test(command)) {
    throw new Error("Check command contains shell control characters that are not supported.");
  }

  const parts = command.trim().match(/"([^"]*)"|'([^']*)'|\S+/g) || [];
  return parts.map((part) => {
    const first = part[0];
    const last = part[part.length - 1];
    return (first === last && (first === '"' || first === "'")) ? part.slice(1, -1) : part;
  });
}

function normalizeCheck(rawCheck, index) {
  const check = rawCheck || {};
  const name = typeof check.name === "string" && check.name.trim()
    ? check.name.trim()
    : `Check ${index + 1}`;
  const workingDirectory = typeof check.workingDirectory === "string" && check.workingDirectory.trim()
    ? check.workingDirectory.trim()
    : ".";

  if (path.isAbsolute(workingDirectory) || workingDirectory.split(/[\\/]+/).includes("..")) {
    return {
      valid: false,
      check: {
        name,
        command: typeof check.command === "string" ? check.command : "",
        workingDirectory,
        required: Boolean(check.required),
      },
      reason: "Check skipped because workingDirectory must be a relative path inside the checkout.",
    };
  }

  return {
    valid: true,
    check: {
      name,
      command: typeof check.command === "string" ? check.command.trim() : "",
      workingDirectory,
      required: Boolean(check.required),
    },
  };
}

function loadConfig(configPath) {
  const config = readJson(configPath);
  if (!Array.isArray(config)) {
    throw new Error("Review check config must be an array.");
  }

  return config.map(normalizeCheck);
}

function runCommand(check) {
  return new Promise((resolve) => {
    const checkoutRoot = process.env.REVIEW_CHECKOUT_ROOT || ".";
    const cwd = path.resolve(process.cwd(), checkoutRoot, check.workingDirectory || ".");
    let child;
    let settled = false;
    let stdout = "";
    let stderr = "";

    function finish(result) {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    }

    try {
      const [executable, ...args] = parseCommand(check.command);
      child = spawn(executable, args, {
        cwd,
        windowsHide: true,
      });
    } catch (error) {
      const capped = capStreams("", error.message);
      finish({
        name: check.name,
        command: check.command,
        workingDirectory: check.workingDirectory || ".",
        required: Boolean(check.required),
        exitCode: null,
        status: "failed",
        stdout: capped.stdout,
        stderr: capped.stderr,
        truncated: capped.truncated,
        error: error.message,
      });
      return;
    }

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      const capped = capStreams(stdout, `${stderr}\n${error.message}`);
      finish({
        name: check.name,
        command: check.command,
        workingDirectory: check.workingDirectory || ".",
        required: Boolean(check.required),
        exitCode: null,
        status: "failed",
        stdout: capped.stdout,
        stderr: capped.stderr,
        truncated: capped.truncated,
        error: error.message,
      });
    });

    child.on("close", (code) => {
      const capped = capStreams(stdout, stderr);
      finish({
        name: check.name,
        command: check.command,
        workingDirectory: check.workingDirectory || ".",
        required: Boolean(check.required),
        exitCode: code,
        status: code === 0 ? "passed" : "failed",
        stdout: capped.stdout,
        stderr: capped.stderr,
        truncated: capped.truncated,
      });
    });
  });
}

function skippedResult(check, reason) {
  return {
    name: check.name || "(unnamed check)",
    command: check.command || "",
    workingDirectory: check.workingDirectory || ".",
    required: Boolean(check.required),
    exitCode: null,
    status: "skipped",
    stdout: "",
    stderr: reason,
    truncated: false,
  };
}

async function runChecks(config) {
  const results = [];

  for (const item of config) {
    const { check, valid, reason } = item.valid === undefined ? normalizeCheck(item, results.length) : item;
    if (!valid) {
      results.push(skippedResult(check, reason));
      continue;
    }

    if (!check.command) {
      results.push(skippedResult(check, "Check skipped because no command was configured."));
      continue;
    }

    results.push(await runCommand(check));
  }

  return results;
}

async function main() {
  const contextPath = process.argv[2] || "review-context.json";
  const outputPath = process.argv[3] || "review-check-results.json";
  const configPath = process.argv[4] || ".ai/review-checks.json";
  process.env.REVIEW_CHECKOUT_ROOT = process.argv[5] || process.env.REVIEW_CHECKOUT_ROOT || ".";
  const skipReason = process.argv[6] || process.env.REVIEW_CHECK_SKIP_REASON || "";

  try {
    const config = loadConfig(configPath);
    const checks = skipReason
      ? config.map((item) => skippedResult(item.check, skipReason))
      : await runChecks(config);
    const payload = { checks, executionError: null };
    const context = tryReadJson(contextPath);

    context.checkResults = payload;

    writeJson(outputPath, payload);
    writeJson(contextPath, context);
  } catch (error) {
    const payload = {
      checks: [],
      executionError: `Review check execution failed unexpectedly: ${error.message}`,
    };
    const context = tryReadJson(contextPath);

    context.checkResults = payload;

    writeJson(outputPath, payload);
    writeJson(contextPath, context);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  MAX_CHECK_OUTPUT,
  capStreams,
  loadConfig,
  normalizeCheck,
  parseCommand,
  runChecks,
  truncate,
};
