import request = require("supertest");
import { app } from "../src";
import { resetTodos } from "../src/routes/todos";

beforeEach(() => {
  resetTodos();
});

describe("toy TODO API", () => {
  test("GET /health returns ok", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  test("GET /todos returns the current TODO list", async () => {
    const response = await request(app).get("/todos");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  test("POST /todos adds TODOs from the new request parameter", async () => {
    const created = await request(app)
      .post("/todos")
      .send({ new: ["write toy server", "leave rough edges"] });

    expect(created.status).toBe(201);
    expect(created.body).toEqual(["write toy server", "leave rough edges"]);

    const response = await request(app).get("/todos");
    expect(response.body).toEqual(["write toy server", "leave rough edges"]);
  });
});
