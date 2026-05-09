import express = require("express");
import todosRouter from "./routes/todos";

export const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/todos", todosRouter);

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`toy-server listening on ${port}`);
  });
}
