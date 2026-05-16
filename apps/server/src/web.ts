import type { SuiRepoState } from "./sui.js";

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

const shortCommit = (commit: string | null): string => {
  return commit ? commit.slice(0, 12) : "No pushes yet";
};

const formatDate = (value: number): string => {
  return new Date(value).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
};

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
      :root {
        color-scheme: light;
        --bg: #f7f8fa;
        --panel: #ffffff;
        --text: #17202a;
        --muted: #5f6b7a;
        --line: #d8dee8;
        --accent: #117a65;
        --accent-soft: #dff3ee;
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

      .meta {
        color: var(--muted);
        white-space: nowrap;
      }

      main {
        padding: 28px 0 40px;
      }

      .table-wrap {
        overflow-x: auto;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
      }

      table {
        width: 100%;
        min-width: 860px;
        border-collapse: collapse;
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

      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        font-size: 13px;
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

      .empty {
        height: 112px;
        color: var(--muted);
        text-align: center;
      }

      @media (max-width: 640px) {
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
      }
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
