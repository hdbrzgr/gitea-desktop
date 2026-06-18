/** Parse a unified diff string into structured hunks for rendering.
 *
 * A unified diff looks like:
 *   diff --git a/f b/f
 *   --- a/f            (or --- /dev/null for added files)
 *   +++ b/f            (or +++ /dev/null for deleted files)
 *   @@ -l,s +l,s @@    hunk header
 *    context line
 *   -removed line
 *   +added line
 *
 * We split into hunks, each with its line-number ranges and a list of
 * typed line records the React viewer can color-code.
 */

export type DiffLineKind = "context" | "add" | "remove" | "hunk";

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
  /** Old-file line number (for context/remove lines). */
  oldNo?: number;
  /** New-file line number (for context/add lines). */
  newNo?: number;
}

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface ParsedDiff {
  /** Path summaries extracted from `diff --git`/`+++`/`---` headers. */
  oldPath: string | null;
  newPath: string | null;
  hunks: DiffHunk[];
}

export function parseDiff(diff: string): ParsedDiff {
  const lines = diff.split("\n");
  let oldPath: string | null = null;
  let newPath: string | null = null;
  const hunks: DiffHunk[] = [];

  let i = 0;
  // Scan headers until we hit the first hunk.
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("--- ")) {
      oldPath = stripPathPrefix(line.slice(4));
    } else if (line.startsWith("+++ ")) {
      newPath = stripPathPrefix(line.slice(4));
    } else if (line.startsWith("@@ ")) {
      break;
    }
    i += 1;
  }

  // Parse hunks.
  while (i < lines.length) {
    const line = lines[i];
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!m) {
      i += 1;
      continue;
    }
    const oldStart = Number(m[1]);
    const oldCount = m[2] === undefined ? 1 : Number(m[2]);
    const newStart = Number(m[3]);
    const newCount = m[4] === undefined ? 1 : Number(m[4]);
    const hunk: DiffHunk = {
      oldStart,
      oldCount,
      newStart,
      newCount,
      lines: [{ kind: "hunk", text: line }],
    };
    i += 1;

    let oldNo = oldStart;
    let newNo = newStart;

    // Consume lines until the next hunk header or a diff/file boundary.
    while (i < lines.length) {
      const l = lines[i];
      if (l.startsWith("@@ ") || l.startsWith("diff --git")) break;
      if (l.startsWith("--- ") || l.startsWith("+++ ")) break;
      if (l === "") {
        i += 1;
        continue;
      }
      const first = l[0];
      if (first === "+") {
        hunk.lines.push({ kind: "add", text: l.slice(1), newNo });
        newNo += 1;
      } else if (first === "-") {
        hunk.lines.push({ kind: "remove", text: l.slice(1), oldNo });
        oldNo += 1;
      } else if (first === "\\") {
        // "\ No newline at end of file" marker.
        hunk.lines.push({ kind: "context", text: l });
      } else {
        const text = first === " " ? l.slice(1) : l;
        hunk.lines.push({ kind: "context", text, oldNo, newNo });
        oldNo += 1;
        newNo += 1;
      }
      i += 1;
    }
    hunks.push(hunk);
  }

  return { oldPath, newPath, hunks };
}

/** Turn `a/path` or `/dev/null` into the bare path (or null). */
function stripPathPrefix(p: string): string | null {
  if (p === "/dev/null") return null;
  if (p.startsWith("a/") || p.startsWith("b/")) return p.slice(2);
  return p;
}

/** Count added/removed lines across all hunks. */
export function countChanges(
  parsed: ParsedDiff,
): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const h of parsed.hunks) {
    for (const l of h.lines) {
      if (l.kind === "add") added += 1;
      else if (l.kind === "remove") removed += 1;
    }
  }
  return { added, removed };
}
