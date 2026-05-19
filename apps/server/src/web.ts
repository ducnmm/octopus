import type { SuiRepoState } from "./sui.js";
import type { BlobView, IndexedCommit, RepoIndex, TreeEntry } from "./indexer.js";

export type RepoListItem = {
  owner: string;
  name: string;
  repoId: string;
  visibility: SuiRepoState["visibility"];
  gitRemotePath: string;
  repoObjectId: string;
  defaultBranch: string;
  defaultBranchCommit: string | null;
  refCount: number;
  manifestCount: number;
  updatedAtMs: number;
};

export const toRepoListItem = (state: SuiRepoState): RepoListItem => ({
  owner: state.owner,
  name: state.repo,
  repoId: state.repoId,
  visibility: state.visibility,
  gitRemotePath: `/${state.owner}/${state.repo}.git`,
  repoObjectId: state.repoObjectId,
  defaultBranch: state.defaultBranch,
  defaultBranchCommit: state.refs[state.defaultBranch]?.commitDigest ?? null,
  refCount: Object.keys(state.refs).length,
  manifestCount: state.manifests.length,
  updatedAtMs: state.updatedAtMs
});

const escapeHtml = (value: string): string => {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "\"":
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
};

const escapeAttr = escapeHtml;

const shortCommit = (commit: string | null): string => {
  return commit ? commit.slice(0, 12) : "No pushes yet";
};

const formatDate = (value: number): string => {
  return new Date(value).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
};

const pageStyles = `
      :root {
        color-scheme: light;
        --bg: #f7f8fa;
        --panel: #ffffff;
        --text: #17202a;
        --muted: #5f6b7a;
        --line: #d8dee8;
        --accent: #117a65;
        --accent-soft: #dff3ee;
        --warn: #8a5a00;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background: var(--bg);
        color: var(--text);
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 14px;
        line-height: 1.45;
      }

      header {
        border-bottom: 1px solid var(--line);
        background: var(--panel);
      }

      main,
      .bar {
        width: min(1180px, calc(100% - 32px));
        margin: 0 auto;
      }

      .bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-height: 64px;
        gap: 16px;
      }

      h1 {
        margin: 0;
        font-size: 20px;
        font-weight: 650;
      }

      h2 {
        margin: 0 0 12px;
        font-size: 15px;
      }

      .meta {
        color: var(--muted);
        white-space: nowrap;
      }

      main {
        padding: 28px 0 40px;
      }

      .stack {
        display: grid;
        gap: 18px;
      }

      .split {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(340px, 0.55fr);
        gap: 18px;
        align-items: start;
      }

      .table-wrap,
      .panel {
        overflow-x: auto;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
      }

      .panel {
        overflow: hidden;
        padding: 16px;
      }

      table {
        width: 100%;
        min-width: 860px;
        border-collapse: collapse;
      }

      .compact {
        min-width: 0;
      }

      th,
      td {
        padding: 12px 14px;
        border-bottom: 1px solid var(--line);
        text-align: left;
        vertical-align: middle;
      }

      th {
        color: var(--muted);
        background: #fbfcfd;
        font-size: 12px;
        font-weight: 650;
        text-transform: uppercase;
      }

      tr:last-child td {
        border-bottom: 0;
      }

      code,
      pre {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        font-size: 13px;
      }

      pre {
        overflow: auto;
        margin: 0;
        border: 1px solid var(--line);
        border-radius: 6px;
        background: #fbfcfd;
        padding: 14px;
        line-height: 1.5;
        white-space: pre-wrap;
      }

      a {
        color: var(--accent);
        font-weight: 650;
        text-decoration: none;
      }

      a:hover {
        text-decoration: underline;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        padding: 0 8px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: #0b5c4a;
        font-size: 12px;
        font-weight: 650;
      }

      .empty,
      .notice {
        height: 112px;
        color: var(--muted);
        text-align: center;
      }

      .notice {
        height: auto;
        border: 1px solid #ead9b4;
        border-radius: 6px;
        background: #fff9ec;
        color: var(--warn);
        padding: 12px;
        text-align: left;
      }

      .crumbs,
      .stats {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
      }

      .stats span {
        color: var(--muted);
      }

      .path {
        overflow-wrap: anywhere;
      }

      @media (max-width: 860px) {
        main,
        .bar {
          width: calc(100% - 20px);
        }

        .bar {
          align-items: flex-start;
          flex-direction: column;
          justify-content: center;
          min-height: 76px;
          gap: 2px;
        }

        .meta {
          white-space: normal;
        }

        .split {
          grid-template-columns: 1fr;
        }
      }
`;

export const renderRepoListPage = (repos: RepoListItem[]): string => {
  const rows =
    repos.length === 0
      ? `<tr><td colspan="7" class="empty">No repositories have been created yet.</td></tr>`
      : repos
          .map((repo) => {
            const repoId = escapeHtml(repo.repoId);
            const remote = escapeHtml(repo.gitRemotePath);
            const manifestHref = `/v1/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/manifests`;

            return `<tr>
              <td><strong>${repoId}</strong></td>
              <td><span class="badge">${escapeHtml(repo.visibility)}</span></td>
              <td><code>${remote}</code></td>
              <td><code>${escapeHtml(shortCommit(repo.defaultBranchCommit))}</code></td>
              <td>${repo.refCount}</td>
              <td><a href="${manifestHref}">${repo.manifestCount}</a></td>
              <td>${escapeHtml(formatDate(repo.updatedAtMs))}</td>
            </tr>`;
          })
          .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Octopus Repositories</title>
    <style>
${pageStyles}
    </style>
  </head>
  <body>
    <header>
      <div class="bar">
        <h1>Octopus Repositories</h1>
        <div class="meta">${repos.length} repos</div>
      </div>
    </header>
    <main>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Repository</th>
              <th>Visibility</th>
              <th>Git Remote</th>
              <th>Default Commit</th>
              <th>Refs</th>
              <th>Manifests</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </main>
  </body>
</html>`;
};

const renderTreeRows = (repo: RepoListItem, ref: string, entries: TreeEntry[]): string => {
  if (entries.length === 0) {
    return `<tr><td colspan="4" class="empty">No files in this tree.</td></tr>`;
  }

  return entries
    .map((entry) => {
      const href =
        entry.type === "tree"
          ? `/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/tree?ref=${encodeURIComponent(ref)}&path=${encodeURIComponent(entry.path)}`
          : `/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/blob?ref=${encodeURIComponent(ref)}&path=${encodeURIComponent(entry.path)}`;

      return `<tr>
        <td><a class="path" href="${href}">${entry.type === "tree" ? "dir " : "file "}${escapeHtml(entry.name)}</a></td>
        <td><code>${escapeHtml(entry.type)}</code></td>
        <td><code>${escapeHtml(entry.objectId.slice(0, 12))}</code></td>
        <td>${entry.size === null ? "" : entry.size}</td>
      </tr>`;
    })
    .join("");
};

const renderCommitRows = (commits: IndexedCommit[]): string => {
  if (commits.length === 0) {
    return `<tr><td colspan="4" class="empty">No commits indexed yet.</td></tr>`;
  }

  return commits
    .slice(0, 25)
    .map((commit) => `<tr>
      <td><code>${escapeHtml(commit.oid.slice(0, 12))}</code></td>
      <td>${escapeHtml(commit.subject)}</td>
      <td>${escapeHtml(commit.authorName)}</td>
      <td>${escapeHtml(commit.authoredAt)}</td>
    </tr>`)
    .join("");
};

const breadcrumbs = (repo: RepoListItem, ref: string, path: string): string => {
  const parts = path ? path.split("/") : [];
  const links = [
    `<a href="/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/tree?ref=${encodeURIComponent(ref)}">root</a>`
  ];
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    links.push(
      `<a href="/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/tree?ref=${encodeURIComponent(ref)}&path=${encodeURIComponent(current)}">${escapeHtml(part)}</a>`
    );
  }
  return links.join(" / ");
};

export const renderRepoPage = (input: {
  repo: RepoListItem;
  index: RepoIndex;
  commits: IndexedCommit[];
  tree: TreeEntry[];
  ref: string;
  path: string;
}): string => {
  const repo = input.repo;
  const repoId = escapeHtml(repo.repoId);
  const treeRows = renderTreeRows(repo, input.ref, input.tree);
  const commitRows = renderCommitRows(input.commits);
  const indexNotice = input.index.treeTruncated
    ? `<p class="notice">File index is truncated at ${input.index.treeEntryCount} entries. Increase OCTOPUS_INDEX_TREE_LIMIT for larger repositories.</p>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${repoId} - Octopus</title>
    <style>
${pageStyles}
    </style>
  </head>
  <body>
    <header>
      <div class="bar">
        <h1><a href="/">Octopus</a> / ${repoId}</h1>
        <div class="meta"><span class="badge">${escapeHtml(repo.visibility)}</span> ${escapeHtml(shortCommit(repo.defaultBranchCommit))}</div>
      </div>
    </header>
    <main class="stack">
      <section class="panel">
        <div class="stats">
          <span>Default branch</span><code>${escapeHtml(repo.defaultBranch)}</code>
          <span>Indexed</span><code>${escapeHtml(formatDate(input.index.indexedAtMs))}</code>
          <span>Files</span><code>${input.index.treeEntryCount}</code>
          <span>Commits</span><code>${input.index.commitCount}</code>
        </div>
        ${indexNotice}
      </section>
      <div class="split">
        <section class="table-wrap">
          <table class="compact">
            <thead>
              <tr><th colspan="4"><div class="crumbs">${breadcrumbs(repo, input.ref, input.path)}</div></th></tr>
              <tr><th>Name</th><th>Type</th><th>Object</th><th>Size</th></tr>
            </thead>
            <tbody>${treeRows}</tbody>
          </table>
        </section>
        <section class="table-wrap">
          <table class="compact">
            <thead><tr><th>Commit</th><th>Subject</th><th>Author</th><th>Date</th></tr></thead>
            <tbody>${commitRows}</tbody>
          </table>
        </section>
      </div>
    </main>
  </body>
</html>`;
};

export const renderBlobPage = (input: {
  repo: RepoListItem;
  index: RepoIndex;
  commits: IndexedCommit[];
  ref: string;
  file: BlobView;
}): string => {
  const repo = input.repo;
  const file = input.file;
  const commitRows = renderCommitRows(input.commits);
  const fileBody =
    file.encoding === "utf8"
      ? `<pre>${escapeHtml(file.content)}</pre>`
      : `<p class="notice">Binary file preview is base64 encoded.</p><pre>${escapeHtml(file.content)}</pre>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(file.path)} - ${escapeHtml(repo.repoId)}</title>
    <style>
${pageStyles}
    </style>
  </head>
  <body>
    <header>
      <div class="bar">
        <h1><a href="/">Octopus</a> / <a href="/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}">${escapeHtml(repo.repoId)}</a></h1>
        <div class="meta"><span class="badge">${escapeHtml(repo.visibility)}</span> ${escapeHtml(shortCommit(repo.defaultBranchCommit))}</div>
      </div>
    </header>
    <main class="stack">
      <section class="panel">
        <div class="crumbs">${breadcrumbs(repo, input.ref, file.path)}</div>
        <div class="stats">
          <span>Object</span><code>${escapeHtml(file.objectId.slice(0, 12))}</code>
          <span>Size</span><code>${file.size}</code>
          <span>Encoding</span><code>${escapeAttr(file.encoding)}</code>
          <span>Indexed</span><code>${escapeHtml(formatDate(input.index.indexedAtMs))}</code>
        </div>
        ${file.truncated ? `<p class="notice">Preview is truncated at the configured blob view limit.</p>` : ""}
        ${fileBody}
      </section>
      <section class="table-wrap">
        <table class="compact">
          <thead><tr><th>Commit</th><th>Subject</th><th>Author</th><th>Date</th></tr></thead>
          <tbody>${commitRows}</tbody>
        </table>
      </section>
    </main>
  </body>
</html>`;
};
