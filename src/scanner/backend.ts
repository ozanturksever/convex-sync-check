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

/**
 * Map from convex-helpers custom*() base function to visibility.
 * e.g. customQuery(query, ...) → public, customQuery(internalQuery, ...) → internal
 */
const BASE_VISIBILITY: Record<string, "public" | "internal"> = {
  query: "public",
  mutation: "public",
  action: "public",
  internalQuery: "internal",
  internalMutation: "internal",
  internalAction: "internal",
};

/**
 * Auto-detect custom function wrappers by scanning for patterns like:
 *   export const authedQuery = customQuery(query, ...)
 *   export const authedMutation = customMutation(mutation, ...)
 *   const myQuery = customQuery(internalQuery, ...)
 *
 * Also detects re-assignments from convex-helpers patterns:
 *   export const { query, mutation } = customFunctions(...)
 */
export function detectWrappers(
  files: string[]
): Record<string, "public" | "internal"> {
  const detected: Record<string, "public" | "internal"> = {};

  // Match: export const NAME = customQuery(BASE, ...) or customMutation(BASE, ...) etc.
  const customFnPattern =
    /(?:export\s+)?const\s+(\w+)\s*=\s*custom(?:Query|Mutation|Action)\s*\(\s*(query|mutation|action|internalQuery|internalMutation|internalAction)\b/g;

  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    let match: RegExpExecArray | null;
    customFnPattern.lastIndex = 0;
    while ((match = customFnPattern.exec(content)) !== null) {
      const wrapperName = match[1];
      const baseFn = match[2];
      // Skip if it shadows a builtin name (e.g. `const query = customQuery(query, ...)`)
      if (BUILTIN_PUBLIC.has(wrapperName) || BUILTIN_INTERNAL.has(wrapperName)) {
        continue;
      }
      const visibility = BASE_VISIBILITY[baseFn];
      if (visibility) {
        detected[wrapperName] = visibility;
      }
    }
  }

  return detected;
}

export function scanBackend(
  convexDir: string,
  functionWrappers?: Record<string, "public" | "internal">
): FunctionDef[] {
  const files = collectTsFiles(convexDir);
  const defs: FunctionDef[] = [];

  // Auto-detect custom wrappers from the source files
  const autoDetected = detectWrappers(files);

  const allPublic = new Set(BUILTIN_PUBLIC);
  const allInternal = new Set(BUILTIN_INTERNAL);

  // Apply auto-detected wrappers first
  for (const [name, visibility] of Object.entries(autoDetected)) {
    if (visibility === "public") allPublic.add(name);
    else allInternal.add(name);
  }

  // Explicit config overrides auto-detected
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
