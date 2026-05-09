import crypto = require("crypto");
import fs = require("fs");
import path = require("path");
import { Request, Response, NextFunction } from "express";

const API_KEY_PREFIX = "todo_sk_";
const RANDOM_BYTES = 32;

type ApiKeyRecord = {
  id: string;
  hash: string;
  createdAt: string;
  revokedAt: string | null;
};

type ApiKeyStore = {
  keys: ApiKeyRecord[];
};

class AuthStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthStoreError";
  }
}

function defaultStorePath() {
  return path.resolve(__dirname, "..", ".api-keys.json");
}

export function getApiKeyStorePath() {
  return process.env.API_KEYS_FILE || defaultStorePath();
}

function hashApiKey(apiKey: string) {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

function isIsoDate(value: string) {
  return !Number.isNaN(Date.parse(value));
}

function validateStore(data: unknown): ApiKeyStore {
  if (!data || typeof data !== "object" || !Array.isArray((data as ApiKeyStore).keys)) {
    throw new AuthStoreError("Invalid API key store");
  }

  const keys = (data as ApiKeyStore).keys;
  for (const key of keys) {
    if (!key || typeof key !== "object") {
      throw new AuthStoreError("Invalid API key record");
    }

    if (
      typeof key.id !== "string" ||
      typeof key.hash !== "string" ||
      !/^[a-f0-9]{64}$/.test(key.hash) ||
      typeof key.createdAt !== "string" ||
      !isIsoDate(key.createdAt) ||
      (key.revokedAt !== null && (typeof key.revokedAt !== "string" || !isIsoDate(key.revokedAt)))
    ) {
      throw new AuthStoreError("Invalid API key record");
    }
  }

  return { keys };
}

function readStore(): ApiKeyStore {
  const storePath = getApiKeyStorePath();

  if (!fs.existsSync(storePath)) {
    return { keys: [] };
  }

  try {
    const contents = fs.readFileSync(storePath, "utf8");
    return validateStore(JSON.parse(contents));
  } catch (error) {
    if (error instanceof AuthStoreError) {
      throw error;
    }
    throw new AuthStoreError("Unable to read API key store");
  }
}

function writeStore(store: ApiKeyStore) {
  const storePath = getApiKeyStorePath();
  const directory = path.dirname(storePath);
  fs.mkdirSync(directory, { recursive: true });

  const temporaryPath = path.join(directory, `.${path.basename(storePath)}.${process.pid}.${Date.now()}.tmp`);
  const contents = `${JSON.stringify(store, null, 2)}\n`;

  fs.writeFileSync(temporaryPath, contents, { mode: 0o600 });
  fs.renameSync(temporaryPath, storePath);

  try {
    fs.chmodSync(storePath, 0o600);
  } catch {
    // Some filesystems do not support chmod; the write mode still covers normal local use.
  }
}

function hashesMatch(storedHash: string, presentedHash: string) {
  const stored = Buffer.from(storedHash, "hex");
  const presented = Buffer.from(presentedHash, "hex");

  return stored.length === presented.length && crypto.timingSafeEqual(stored, presented);
}

export function createApiKey() {
  const store = readStore();

  for (let attempts = 0; attempts < 5; attempts += 1) {
    const apiKey = `${API_KEY_PREFIX}${crypto.randomBytes(RANDOM_BYTES).toString("base64url")}`;
    const hash = hashApiKey(apiKey);

    if (store.keys.some((key) => key.hash === hash)) {
      continue;
    }

    const record: ApiKeyRecord = {
      id: crypto.randomBytes(8).toString("base64url"),
      hash,
      createdAt: new Date().toISOString(),
      revokedAt: null,
    };

    writeStore({ keys: [...store.keys, record] });
    return { apiKey, id: record.id };
  }

  throw new AuthStoreError("Unable to generate unique API key");
}

export function revokeApiKey(apiKey: string) {
  const trimmedApiKey = apiKey.trim();
  if (!trimmedApiKey) {
    return { revoked: false, alreadyRevoked: false };
  }

  const store = readStore();
  const hash = hashApiKey(trimmedApiKey);
  const matchingKey = store.keys.find((key) => hashesMatch(key.hash, hash));

  if (!matchingKey) {
    return { revoked: false, alreadyRevoked: false };
  }

  if (matchingKey.revokedAt) {
    return { revoked: false, alreadyRevoked: true };
  }

  matchingKey.revokedAt = new Date().toISOString();
  writeStore(store);

  return { revoked: true, alreadyRevoked: false };
}

export function isApiKeyValid(apiKey: string) {
  const hash = hashApiKey(apiKey);
  const store = readStore();

  return store.keys.some((key) => key.revokedAt === null && hashesMatch(key.hash, hash));
}

function getBearerToken(req: Request) {
  const authorization = req.get("authorization");
  if (!authorization) {
    return null;
  }

  const match = authorization.match(/^Bearer ([^\s]+)$/);
  return match ? match[1] : null;
}

export function auth() {
  return (req: Request, res: Response, next: NextFunction) => {
    const apiKey = getBearerToken(req);

    if (!apiKey) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      if (!isApiKeyValid(apiKey)) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
    } catch (error) {
      if (error instanceof AuthStoreError) {
        res.status(500).json({ error: "Authentication unavailable" });
        return;
      }
      throw error;
    }

    next();
  };
}
