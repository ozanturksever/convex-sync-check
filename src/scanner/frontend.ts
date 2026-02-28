import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { FrontendRef } from "../types.js";

const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const SKIP_DIRS = new Set(["node_modules", "__tests__", "_generated"]);
const SKIP_FILE_PATTERNS = [/\.test\.\w+$/, /\.spec\.\w+$/];

const API_PATTERN = /\bapi\.([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)+)/g;

export function scanFrontend(frontendDirs: string[]): FrontendRef[] {
  const refs: FrontendRef[] = [];

  for (const dir of frontendDirs) {
    const files = collectSourceFiles(dir);
    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Skip full-line comments
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
          continue;
        }

        // Strip inline comments before matching
        const stripped = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");

        let match: RegExpExecArray | null;
        API_PATTERN.lastIndex = 0;
        while ((match = API_PATTERN.exec(stripped)) !== null) {
          refs.push({
            apiPath: match[1],
            file,
            line: i + 1,
          });
        }
      }
    }
  }

  return refs;
}

function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];

  function walk(current: string) {
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(current, entry);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        if (!SKIP_DIRS.has(entry)) walk(fullPath);
      } else {
        const ext = entry.slice(entry.lastIndexOf("."));
        if (
          EXTENSIONS.has(ext) &&
          !SKIP_FILE_PATTERNS.some((p) => p.test(entry))
        ) {
          results.push(fullPath);
        }
      }
    }
  }

  walk(dir);
  return results;
}
