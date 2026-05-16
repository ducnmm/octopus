#!/usr/bin/env node
import { Command } from "commander";
import { createRepoRequestSchema } from "@octopus/shared";

const defaultBaseUrl = `http://${process.env.OCTOPUS_HOST ?? "127.0.0.1"}:${process.env.OCTOPUS_PORT ?? "8787"}`;

const requestJson = async <T>(url: string, init: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {})
    }
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(data.error ?? `Request failed with ${response.status}`);
  }

  return data as T;
};

const program = new Command();

program
  .name("octopus")
  .description("Octopus developer CLI")
  .version("0.1.0");

program
  .command("auth")
  .command("login")
  .description("Start wallet-backed CLI login")
  .action(() => {
    console.log("auth login is specified but not implemented yet");
    console.log("Spec: specs/protocols/auth.md");
  });

const repoCommand = program
  .command("repo")
  .description("Manage Octopus repositories");

repoCommand
  .command("create")
  .argument("<name>", "repository name")
  .option("--owner <owner>", "repository owner", process.env.OCTOPUS_OWNER ?? "ducnmm")
  .option("--private", "create a private repository")
  .option("--server <url>", "Octopus server URL", defaultBaseUrl)
  .action(async (name: string, options: { owner: string; private?: boolean; server: string }) => {
    const payload = createRepoRequestSchema.parse({
      owner: options.owner,
      name,
      visibility: options.private ? "private" : "public"
    });

    const repo = await requestJson<{
      owner: string;
      name: string;
      visibility: string;
      gitRemotePath: string;
    }>(new URL("/v1/repos", options.server).toString(), {
      method: "POST",
      body: JSON.stringify(payload)
    });

    const remote = new URL(repo.gitRemotePath, options.server).toString();
    console.log(`Created ${repo.owner}/${repo.name} (${repo.visibility})`);
    console.log(`Remote: ${remote}`);
  });

repoCommand
  .command("manifests")
  .argument("<repo>", "repository in owner/name form")
  .option("--server <url>", "Octopus server URL", defaultBaseUrl)
  .description("List local artifact manifests for a repository")
  .action(async (repo: string, options: { server: string }) => {
    const [owner, name] = repo.split("/");
    if (!owner || !name) {
      throw new Error("repo must use owner/name format");
    }

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
      method: "GET"
    });

    if (response.manifests.length === 0) {
      console.log(`No manifests for ${repo}`);
      return;
    }

    for (const manifest of response.manifests) {
      console.log(`${manifest.manifestId}`);
      console.log(`  ref:    ${manifest.refName}`);
      console.log(`  commit: ${manifest.newCommit}`);
      console.log(`  blob:   ${manifest.walrusBlobId}`);
      console.log(`  mode:   ${manifest.storageMode}`);
      console.log(`  sha256: ${manifest.artifactDigest}`);
    }
  });

const restoreRepo = async (repo: string, options: { server: string }) => {
  const [owner, name] = repo.split("/");
  if (!owner || !name) {
    throw new Error("repo must use owner/name format");
  }

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
    method: "POST"
  });

  console.log(`Restored ${response.owner}/${response.repo}`);
  console.log(`  repo:     ${response.repoPath}`);
  console.log(`  manifest: ${response.manifestId}`);
  console.log(`  ref:      ${response.refName}`);
  console.log(`  commit:   ${response.restoredCommit}`);
  console.log(`  mode:     ${response.storageMode}`);
  console.log(`  source:   ${response.manifestSource}`);
  console.log(`  sha256:   ${response.artifactDigest}`);
};

repoCommand
  .command("restore")
  .argument("<repo>", "repository in owner/name form")
  .option("--server <url>", "Octopus server URL", defaultBaseUrl)
  .description("Restore a repository cache from durable storage")
  .action(restoreRepo);

program
  .command("restore")
  .argument("<repo>", "repository in owner/name form")
  .option("--server <url>", "Octopus server URL", defaultBaseUrl)
  .description("Restore a repository cache from durable storage")
  .action(restoreRepo);

await program.parseAsync();
