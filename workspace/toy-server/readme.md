# Toy Server

This is a small TypeScript Express API used as a toy TODO app for agent tasks.

## What Exists

- `GET /health` returns a basic health response.
- `GET /todos` returns the current in-memory TODO list.
- `POST /todos` accepts a JSON body with a `new` field and appends those items to the TODO list.

Example POST body:

```json
{
  "new": ["write test", "update route"]
}
```

TODOs are kept in memory while the server process is running.

## Repo Structure

```text
workspace/toy-server/
  src/
    index.ts
    routes/
      todos.ts
    auth.ts
  tests/
    todos.test.ts
  package.json
  package-lock.json
  readme.md
```

Key files:

- `src/index.ts` creates the Express app, adds JSON body parsing, defines `/health`, and mounts the TODO routes.
- `src/routes/todos.ts` stores the TODO list and defines the `/todos` handlers.
- `src/auth.ts` contains a small placeholder middleware function.
- `tests/todos.test.ts` contains endpoint tests using Jest and Supertest.

## Commands

Install dependencies:

```sh
npm install
```

Run the server in development:

```sh
npm run dev
```

Build the TypeScript source:

```sh
npm run build
```

Run the built server:

```sh
npm start
```

Run tests:

```sh
npm test
```

By default the server listens on port `3000`. Set `PORT` to use a different port.
