# Toy Server

This is a small TypeScript Express API used as a toy TODO app for agent tasks.

## What Exists

- `GET /health` returns a basic health response.
- `GET /todos` returns the current in-memory TODO list.
- `POST /todos` requires an API key, accepts a JSON body with a `new` field, and appends those items to the TODO list.

Example POST body:

```json
{
  "new": ["write test", "update route"]
}
```

TODOs are kept in memory while the server process is running.

## API Keys

Only `POST /todos` requires authentication. `GET /health` and `GET /todos` remain public.

Create an API key:

```sh
npm run api-key:generate
```

The generated key is printed once. The server stores only a secure hash of the key in `.api-keys.json`.

Revoke an API key:

```sh
npm run api-key:revoke -- <api-key>
```

Revoked keys remain recorded and cannot be used again.


This toy prototype does not support running `api-key:generate`/`api-key:revoke` concurrently; simultaneous commands can race and produce unexpected key-store results.

Passing a key to `api-key:revoke` as a CLI argument can expose it in shell history and process listings. That tradeoff is accepted for this toy prototype only.

Authenticate `POST /todos` with the `Authorization` header:

```http
Authorization: Bearer <api-key>
```

Example:

```sh
curl -X POST http://localhost:3000/todos \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <api-key>" \
  -d "{\"new\":[\"write test\",\"update route\"]}"
```

Set `API_KEYS_FILE` to use a different key store path. This is useful for tests or separate local environments:

```sh
API_KEYS_FILE=/path/to/.api-keys.json npm run dev
```

## Repo Structure

```text
workspace/toy-server/
  src/
    index.ts
    routes/
      todos.ts
    auth.ts
    cli/
      apiKeys.ts
  tests/
    todos.test.ts
  package.json
  package-lock.json
  readme.md
```

Key files:

- `src/index.ts` creates the Express app, adds JSON body parsing, defines `/health`, and mounts the TODO routes.
- `src/routes/todos.ts` stores the TODO list and defines the `/todos` handlers.
- `src/auth.ts` contains API key generation, revocation, storage, and authentication middleware.
- `src/cli/apiKeys.ts` contains the command-line API key tooling.
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
