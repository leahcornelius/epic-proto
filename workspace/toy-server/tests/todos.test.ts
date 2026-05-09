import fs = require("fs");
import os = require("os");
import path = require("path");
import request = require("supertest");
import { app } from "../src";
import { runApiKeyCli } from "../src/cli/apiKeys";
import { createApiKey, revokeApiKey } from "../src/auth";
import { resetTodos } from "../src/routes/todos";

const projectRoot = path.resolve(__dirname, "..");
let tempDir: string;
let apiKeysFile: string;

function authHeader(apiKey: string) {
  return `Bearer ${apiKey}`;
}

function runCli(args: string[]) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const status = runApiKeyCli(args, {
    stdout: (message) => stdout.push(message),
    stderr: (message) => stderr.push(message),
  });

  return { status, stdout: stdout.join("\n"), stderr: stderr.join("\n") };
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "toy-server-auth-"));
  apiKeysFile = path.join(tempDir, ".api-keys.json");
  process.env.API_KEYS_FILE = apiKeysFile;
  resetTodos();
});

afterEach(() => {
  delete process.env.API_KEYS_FILE;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("toy TODO API", () => {
  test("GET /health returns ok without authentication", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  test("GET /todos returns the current TODO list without authentication", async () => {
    const response = await request(app).get("/todos");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  test("POST /todos adds TODOs from the new request parameter with a valid API key", async () => {
    const { apiKey } = createApiKey();

    const created = await request(app)
      .post("/todos")
      .set("Authorization", authHeader(apiKey))
      .send({ new: ["write toy server", "leave rough edges"] });

    expect(created.status).toBe(201);
    expect(created.body).toEqual(["write toy server", "leave rough edges"]);

    const response = await request(app).get("/todos");
    expect(response.body).toEqual(["write toy server", "leave rough edges"]);
  });

  test("POST /todos rejects missing, malformed, invalid, and revoked API keys", async () => {
    const { apiKey } = createApiKey();
    revokeApiKey(apiKey);

    const cases: Array<string | null> = [
      null,
      "Bearer",
      "Bearer    ",
      "Bearer    todo_sk_fake",
      "Basic abc123",
      "Token abc123",
      "abc123",
      "Bearer todo_sk_unknown",
      authHeader(apiKey),
    ];

    for (const header of cases) {
      const req = request(app).post("/todos").send({ new: ["blocked"] });
      if (header) {
        req.set("Authorization", header);
      }

      const response = await req;
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: "Unauthorized" });
    }

    const todos = await request(app).get("/todos");
    expect(todos.body).toEqual([]);
  });


  test("POST /todos accepts lowercase bearer scheme", async () => {
    const { apiKey } = createApiKey();

    const response = await request(app)
      .post("/todos")
      .set("Authorization", `bearer ${apiKey}`)
      .send({ new: ["lowercase scheme"] });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(["lowercase scheme"]);
  });

  test("multiple active API keys work and revoking one does not revoke another", async () => {
    const first = createApiKey();
    const second = createApiKey();

    const firstCreate = await request(app)
      .post("/todos")
      .set("Authorization", authHeader(first.apiKey))
      .send({ new: ["first"] });
    expect(firstCreate.status).toBe(201);

    const secondCreate = await request(app)
      .post("/todos")
      .set("Authorization", authHeader(second.apiKey))
      .send({ new: ["second"] });
    expect(secondCreate.status).toBe(201);

    revokeApiKey(first.apiKey);

    const revoked = await request(app)
      .post("/todos")
      .set("Authorization", authHeader(first.apiKey))
      .send({ new: ["blocked"] });
    expect(revoked.status).toBe(401);
    expect(revoked.body).toEqual({ error: "Unauthorized" });

    const stillActive = await request(app)
      .post("/todos")
      .set("Authorization", authHeader(second.apiKey))
      .send({ new: ["third"] });
    expect(stillActive.status).toBe(201);
    expect(stillActive.body).toEqual(["first", "second", "third"]);
  });

  test("active and revoked key states persist through file-backed reloads", async () => {
    const active = createApiKey();
    const revoked = createApiKey();
    revokeApiKey(revoked.apiKey);

    resetTodos();

    const activeResponse = await request(app)
      .post("/todos")
      .set("Authorization", authHeader(active.apiKey))
      .send({ new: ["after restart"] });
    expect(activeResponse.status).toBe(201);

    const revokedResponse = await request(app)
      .post("/todos")
      .set("Authorization", authHeader(revoked.apiKey))
      .send({ new: ["blocked"] });
    expect(revokedResponse.status).toBe(401);
  });

  test("API keys are only accepted in the Authorization bearer header", async () => {
    const { apiKey } = createApiKey();

    const query = await request(app).post(`/todos?api_key=${apiKey}`).send({ new: ["blocked"] });
    expect(query.status).toBe(401);

    const body = await request(app).post("/todos").send({ apiKey, new: ["blocked"] });
    expect(body.status).toBe(401);

    const alternateHeader = await request(app)
      .post("/todos")
      .set("X-API-Key", apiKey)
      .send({ new: ["blocked"] });
    expect(alternateHeader.status).toBe(401);

    const todos = await request(app).get("/todos");
    expect(todos.body).toEqual([]);
  });

  test("POST /todos validates request bodies before mutating state", async () => {
    const { apiKey } = createApiKey();
    const invalidBodies = [{}, { new: null }, { new: "task" }, { new: [123] }, { new: [{}] }];

    for (const body of invalidBodies) {
      const response = await request(app)
        .post("/todos")
        .set("Authorization", authHeader(apiKey))
        .send(body);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "Invalid request body" });
    }

    const empty = await request(app)
      .post("/todos")
      .set("Authorization", authHeader(apiKey))
      .send({ new: [] });
    expect(empty.status).toBe(201);
    expect(empty.body).toEqual([]);

    const todos = await request(app).get("/todos");
    expect(todos.body).toEqual([]);
  });

  test("authentication fails closed when the key store is corrupt or structurally invalid", async () => {
    for (const contents of ["", "not json", JSON.stringify({ keys: [{ id: "bad" }] })]) {
      fs.writeFileSync(apiKeysFile, contents);

      const response = await request(app)
        .post("/todos")
        .set("Authorization", "Bearer todo_sk_anything")
        .send({ new: ["blocked"] });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: "Authentication unavailable" });
    }

    const todos = await request(app).get("/todos");
    expect(todos.body).toEqual([]);
  });

  test("generated key store contains hashes and metadata, not plaintext API keys", () => {
    const { apiKey } = createApiKey();
    const storeText = fs.readFileSync(apiKeysFile, "utf8");
    const store = JSON.parse(storeText);

    expect(storeText).not.toContain(apiKey);
    expect(store.keys).toHaveLength(1);
    expect(store.keys[0].hash).toMatch(/^[a-f0-9]{64}$/);
    expect(store.keys[0].createdAt).toEqual(expect.any(String));
    expect(store.keys[0].revokedAt).toBeNull();

    revokeApiKey(apiKey);
    const revokedStore = JSON.parse(fs.readFileSync(apiKeysFile, "utf8"));
    expect(revokedStore.keys[0].revokedAt).toEqual(expect.any(String));
  });
});

describe("API key CLI", () => {
  test("generate creates a usable key without storing plaintext", async () => {
    const result = runCli(["generate"]);

    expect(result.status).toBe(0);
    const apiKey = result.stdout.trim();
    expect(apiKey).toMatch(/^todo_sk_[A-Za-z0-9_-]{43}$/);
    expect(result.stdout.match(/todo_sk_/g)).toHaveLength(1);

    const storeText = fs.readFileSync(apiKeysFile, "utf8");
    expect(storeText).not.toContain(apiKey);

    const response = await request(app)
      .post("/todos")
      .set("Authorization", authHeader(apiKey))
      .send({ new: ["from cli"] });
    expect(response.status).toBe(201);
  });

  test("generate can create multiple distinct active keys", async () => {
    const first = runCli(["generate"]).stdout.trim();
    const second = runCli(["generate"]).stdout.trim();

    expect(first).not.toEqual(second);

    for (const apiKey of [first, second]) {
      const response = await request(app)
        .post("/todos")
        .set("Authorization", authHeader(apiKey))
        .send({ new: [apiKey] });
      expect(response.status).toBe(201);
    }
  });

  test("revoke makes a generated key unusable and unknown revoke exits non-zero", async () => {
    const apiKey = runCli(["generate"]).stdout.trim();

    const revoke = runCli(["revoke", apiKey]);
    expect(revoke.status).toBe(0);
    expect(revoke.stdout.trim()).toBe("API key revoked");

    const response = await request(app)
      .post("/todos")
      .set("Authorization", authHeader(apiKey))
      .send({ new: ["blocked"] });
    expect(response.status).toBe(401);

    const unknown = runCli(["revoke", "todo_sk_unknown"]);
    expect(unknown.status).not.toBe(0);
    expect(unknown.stderr).toContain("No matching API key found");
  });

  test("commands fail closed with corrupt key stores", () => {
    fs.writeFileSync(apiKeysFile, "not json");

    const generate = runCli(["generate"]);
    expect(generate.status).not.toBe(0);
    expect(generate.stderr).toContain("Unable to read API key store");

    const revoke = runCli(["revoke", "todo_sk_unknown"]);
    expect(revoke.status).not.toBe(0);
    expect(revoke.stderr).toContain("Unable to read API key store");
  });

  test("package scripts expose API key commands", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));

    expect(packageJson.scripts["api-key:generate"]).toBe("tsx src/cli/apiKeys.ts generate");
    expect(packageJson.scripts["api-key:revoke"]).toBe("tsx src/cli/apiKeys.ts revoke");
  });
});
