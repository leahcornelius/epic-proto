import { createApiKey, revokeApiKey } from "../auth";

type CliIo = {
  stdout: (message: string) => void;
  stderr: (message: string) => void;
};

const defaultIo: CliIo = {
  stdout: (message) => console.log(message),
  stderr: (message) => console.error(message),
};

function usage(io: CliIo) {
  io.stderr("Usage: api-keys <generate|revoke> [api-key]");
}

export function runApiKeyCli(args: string[], io: CliIo = defaultIo) {
  try {
    const [command, apiKey] = args;
    if (command === "generate") {
      const created = createApiKey();
      io.stdout(created.apiKey);
      return 0;
    }

    if (command === "revoke") {
      if (!apiKey) {
        usage(io);
        return 1;
      }

      const result = revokeApiKey(apiKey);
      if (result.revoked) {
        io.stdout("API key revoked");
        return 0;
      }

      if (result.alreadyRevoked) {
        io.stdout("API key already revoked");
        return 0;
      }

      io.stderr("No matching API key found");
      return 1;
    }

    usage(io);
    return 1;
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : "API key command failed");
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = runApiKeyCli(process.argv.slice(2));
}
