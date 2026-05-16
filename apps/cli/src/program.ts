import { Command, InvalidArgumentError } from "commander";
import { createRepoRequestSchema } from "@octopus/shared";
import { requestJson, type OctopusFetch } from "./client.js";
import { credentialsPath } from "./credentials.js";

export type CliIO = {
  stdout: Pick<NodeJS.WriteStream, "write">;
  stderr: Pick<NodeJS.WriteStream, "write">;
};

export type CliContext = CliIO & {
  env: NodeJS.ProcessEnv;
  fetch: OctopusFetch;
  home?: string;
};

type RepoCreateOptions = {
  owner: string;
  private?: boolean | string;
  public?: boolean;
  server: string;
};

type RepoServerOptions = {
  server: string;
};

const defaultBaseUrl = (env: NodeJS.ProcessEnv): string => {
  return `http://${env.OCTOPUS_HOST ?? "127.0.0.1"}:${env.OCTOPUS_PORT ?? "18787"}`;
};

const writeLine = (stream: Pick<NodeJS.WriteStream, "write">, line = ""): void => {
  stream.write(`${line}\n`);
};

const parseOptionalBoolean = (value: boolean | string | undefined, optionName: string): boolean => {
  if (value === undefined || value === false) {
    return false;
  }

  if (value === true) {
    return true;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new InvalidArgumentError(`${optionName} expects true or false`);
};

const visibilityFromOptions = (options: RepoCreateOptions): "public" | "private" => {
  const privateRequested = parseOptionalBoolean(options.private, "--private");
  if (options.public && privateRequested) {
    throw new InvalidArgumentError("choose only one of --public or --private");
  }

  return privateRequested ? "private" : "public";
};

const splitRepo = (repo: string): { owner: string; name: string } => {
  const [owner, name, extra] = repo.split("/");
  if (!owner || !name || extra) {
    throw new InvalidArgumentError("repo must use owner/name format");
  }

  return { owner, name };
};

export const createProgram = (context: CliContext): Command => {
  const program = new Command();
  const baseUrl = defaultBaseUrl(context.env);

  program
    .name("octopus")
    .description("Octopus developer CLI")
    .version("0.1.0");

  program.configureOutput({
    writeOut: (value) => context.stdout.write(value),
    writeErr: (value) => context.stderr.write(value)
  });

  const authCommand = program
    .command("auth")
    .description("Manage authentication");

  authCommand
    .command("login")
    .description("Start wallet-backed CLI login")
    .action(() => {
      writeLine(context.stdout, "auth login is not wired to wallet approval yet");
      writeLine(context.stdout, `Credentials will be stored at ${credentialsPath(context.home)}`);
      writeLine(context.stdout, "Spec: specs/protocols/auth.md");
    });

  const repoCommand = program
    .command("repo")
    .description("Manage Octopus repositories");

  repoCommand
    .command("create")
    .argument("<name>", "repository name")
    .option("--owner <owner>", "repository owner", context.env.OCTOPUS_OWNER ?? "ducnmm")
    .option("--public", "create a public repository")
    .option("--private [value]", "create a private repository; use --private=false for public compatibility")
    .option("--server <url>", "Octopus server URL", baseUrl)
    .action(async (name: string, options: RepoCreateOptions) => {
      const payload = createRepoRequestSchema.parse({
        owner: options.owner,
        name,
        visibility: visibilityFromOptions(options)
      });

      const repo = await requestJson<{
        owner: string;
        name: string;
        visibility: string;
        gitRemotePath: string;
      }>(new URL("/v1/repos", options.server).toString(), {
        fetch: context.fetch,
        method: "POST",
        body: JSON.stringify(payload)
      });

      const remote = new URL(repo.gitRemotePath, options.server).toString();
      writeLine(context.stdout, `Created ${repo.owner}/${repo.name} (${repo.visibility})`);
      writeLine(context.stdout, `Remote: ${remote}`);
    });

  repoCommand
    .command("manifests")
    .argument("<repo>", "repository in owner/name form")
    .option("--server <url>", "Octopus server URL", baseUrl)
    .description("List local artifact manifests for a repository")
    .action(async (repo: string, options: RepoServerOptions) => {
      const { owner, name } = splitRepo(repo);
      const response = await requestJson<{
        manifests: Array<{
          manifestId: string;
          refName: string;
          newCommit: string;
          walrusBlobId: string;
          artifactDigest: string;
          storageMode: string;
        }>;
      }>(new URL(`/v1/repos/${owner}/${name}/manifests`, options.server).toString(), {
        fetch: context.fetch,
        method: "GET"
      });

      if (response.manifests.length === 0) {
        writeLine(context.stdout, `No manifests for ${repo}`);
        return;
      }

      for (const manifest of response.manifests) {
        writeLine(context.stdout, `${manifest.manifestId}`);
        writeLine(context.stdout, `  ref:    ${manifest.refName}`);
        writeLine(context.stdout, `  commit: ${manifest.newCommit}`);
        writeLine(context.stdout, `  blob:   ${manifest.walrusBlobId}`);
        writeLine(context.stdout, `  mode:   ${manifest.storageMode}`);
        writeLine(context.stdout, `  sha256: ${manifest.artifactDigest}`);
      }
    });

  const restoreRepo = async (repo: string, options: RepoServerOptions) => {
    const { owner, name } = splitRepo(repo);
    const response = await requestJson<{
      owner: string;
      repo: string;
      repoPath: string;
      manifestId: string;
      refName: string;
      restoredCommit: string;
      artifactDigest: string;
      storageMode: string;
      manifestSource: string;
    }>(new URL(`/v1/repos/${owner}/${name}/restore`, options.server).toString(), {
      fetch: context.fetch,
      method: "POST"
    });

    writeLine(context.stdout, `Restored ${response.owner}/${response.repo}`);
    writeLine(context.stdout, `  repo:     ${response.repoPath}`);
    writeLine(context.stdout, `  manifest: ${response.manifestId}`);
    writeLine(context.stdout, `  ref:      ${response.refName}`);
    writeLine(context.stdout, `  commit:   ${response.restoredCommit}`);
    writeLine(context.stdout, `  mode:     ${response.storageMode}`);
    writeLine(context.stdout, `  source:   ${response.manifestSource}`);
    writeLine(context.stdout, `  sha256:   ${response.artifactDigest}`);
  };

  repoCommand
    .command("restore")
    .argument("<repo>", "repository in owner/name form")
    .option("--server <url>", "Octopus server URL", baseUrl)
    .description("Restore a repository cache from durable storage")
    .action(restoreRepo);

  program
    .command("restore")
    .argument("<repo>", "repository in owner/name form")
    .option("--server <url>", "Octopus server URL", baseUrl)
    .description("Restore a repository cache from durable storage")
    .action(restoreRepo);

  return program;
};

export const runCli = async (
  argv: string[],
  context: Partial<CliContext> = {}
): Promise<void> => {
  const stderr = context.stderr ?? process.stderr;
  const program = createProgram({
    env: context.env ?? process.env,
    fetch: context.fetch ?? fetch,
    home: context.home,
    stdout: context.stdout ?? process.stdout,
    stderr
  });

  program.exitOverride();

  try {
    await program.parseAsync(argv, { from: "user" });
  } catch (error) {
    if (error instanceof Error && error.name === "CommanderError") {
      const exitCode = (error as Error & { exitCode?: number }).exitCode;
      process.exitCode = exitCode ?? 1;
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    writeLine(stderr, `error: ${message}`);
    process.exitCode = 1;
  }
};
