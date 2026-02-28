import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { FunctionDef } from "../types.js";

const BUILTIN_PUBLIC = new Set(["query", "mutation", "action"]);
const BUILTIN_INTERNAL = new Set([
  "internalQuery",
  "internalMutation",
  "internalAction",
]);
const SKIP_DIRS = new Set(["_generated", "node_modules"]);
const SKIP_FILE_PATTERNS = [/\.test\.ts$/, /\.spec\.ts$/];

export function scanBackend(
  convexDir: string,
  functionWrappers?: Record<string, "public" | "internal">
): FunctionDef[] {
  const files = collectTsFiles(convexDir);
  const defs: FunctionDef[] = [];

  const allPublic = new Set(BUILTIN_PUBLIC);
  const allInternal = new Set(BUILTIN_INTERNAL);
  if (functionWrappers) {
    for (const [name, visibility] of Object.entries(functionWrappers)) {
      if (visibility === "public") allPublic.add(name);
      else allInternal.add(name);
    }
  }

  const typePattern = [...allPublic, ...allInternal]
    .map((t) => escapeRegex(t))
    .join("|");
  const regex = new RegExp(
    `^export\\s+const\\s+(\\w+)\\s*=\\s*(${typePattern})\\s*\\(`,
    "gm"
  );

  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    const relPath = relative(convexDir, file);
    const modulePath = relPath.replace(/\.ts$/, "").split(sep).join(".");

    let match: RegExpExecArray | null;
    regex.lastIndex = 0;
    while ((match = regex.exec(content)) !== null) {
      const name = match[1];
      const fnType = match[2];

      if (fnType === "httpAction") continue;

      const line = content.substring(0, match.index).split("\n").length;
      defs.push({
        name,
        apiPath: `${modulePath}.${name}`,
        type: fnType,
        isInternal: allInternal.has(fnType),
        file,
        line,
      });
    }
  }

  return defs;
}

function collectTsFiles(dir: string): string[] {
  const results: string[] = [];

  function walk(current: string) {
    const entries = readdirSync(current);
    for (const entry of entries) {
      const fullPath = join(current, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        if (!SKIP_DIRS.has(entry)) walk(fullPath);
      } else if (
        entry.endsWith(".ts") &&
        !SKIP_FILE_PATTERNS.some((p) => p.test(entry))
      ) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
