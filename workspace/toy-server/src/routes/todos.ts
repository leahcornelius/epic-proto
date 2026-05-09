import { Router } from "express";
import { auth } from "../auth";

const router = Router();
const todos: unknown[] = [];

router.get("/", (_req, res) => {
  res.json(todos);
});

router.post("/", auth(), (req, res) => {
  if (
    !req.body ||
    typeof req.body !== "object" ||
    !Array.isArray(req.body.new) ||
    !req.body.new.every((todo: unknown) => typeof todo === "string")
  ) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  todos.push(...req.body.new);
  res.status(201).json(todos);
});

export function resetTodos() {
  todos.length = 0;
}

export default router;
