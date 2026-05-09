import { Router } from "express";

const router = Router();
const todos: unknown[] = [];

router.get("/", (_req, res) => {
  res.json(todos);
});

router.post("/", (req, res) => {
  todos.push(...req.body.new);
  res.status(201).json(todos);
});

export function resetTodos() {
  todos.length = 0;
}

export default router;
