// Minimal README markdown renderer ported from the legacy server views.
// Output is safe by construction: every text fragment passes through
// escapeHtml/escapeAttr and hrefs are filtered by safeMarkdownHref.

const escapeHtml = (value: string): string => {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
};

const escapeAttr = escapeHtml;

const safeMarkdownHref = (href: string): string | null => {
  const trimmed = href.trim();
  if (!trimmed || trimmed.includes("\0")) {
    return null;
  }

  if (/^(https?:\/\/|\/|#)/i.test(trimmed)) {
    return trimmed;
  }

  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(trimmed)) {
    return null;
  }

  return trimmed;
};

const renderInlineMarkdown = (value: string): string => {
  const pattern = /(`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let cursor = 0;
  let output = "";
  for (const match of value.matchAll(pattern)) {
    output += escapeHtml(value.slice(cursor, match.index));
    const token = match[0];
    if (token.startsWith("`")) {
      output += `<code>${escapeHtml(token.slice(1, -1))}</code>`;
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const href = link ? safeMarkdownHref(link[2] ?? "") : null;
      output += href
        ? `<a href="${escapeAttr(href)}">${escapeHtml(link?.[1] ?? "")}</a>`
        : escapeHtml(link?.[1] ?? token);
    }
    cursor = (match.index ?? 0) + token.length;
  }

  output += escapeHtml(value.slice(cursor));
  return output;
};

export const renderReadmeMarkdown = (content: string): string => {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const html: string[] = [];
  let list: "ul" | "ol" | null = null;
  let codeFence = false;
  let codeLines: string[] = [];

  const closeList = (): void => {
    if (list) {
      html.push(`</${list}>`);
      list = null;
    }
  };

  const openList = (type: "ul" | "ol"): void => {
    if (list === type) {
      return;
    }
    closeList();
    list = type;
    html.push(`<${type}>`);
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");
    if (line.startsWith("```")) {
      if (codeFence) {
        html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
        codeFence = false;
      } else {
        closeList();
        codeFence = true;
      }
      continue;
    }

    if (codeFence) {
      codeLines.push(rawLine);
      continue;
    }

    if (!line.trim()) {
      closeList();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = Math.min(heading[1]?.length ?? 1, 6);
      html.push(`<h${level}>${renderInlineMarkdown(heading[2] ?? "")}</h${level}>`);
      continue;
    }

    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    if (unordered) {
      openList("ul");
      html.push(`<li>${renderInlineMarkdown(unordered[1] ?? "")}</li>`);
      continue;
    }

    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (ordered) {
      openList("ol");
      html.push(`<li>${renderInlineMarkdown(ordered[1] ?? "")}</li>`);
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      closeList();
      html.push(`<blockquote><p>${renderInlineMarkdown(quote[1] ?? "")}</p></blockquote>`);
      continue;
    }

    closeList();
    html.push(`<p>${renderInlineMarkdown(line)}</p>`);
  }

  if (codeFence) {
    html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }
  closeList();
  return html.join("\n");
};
