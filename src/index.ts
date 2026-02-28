import { scanBackend } from "./scanner/backend.js";
import { scanFrontend } from "./scanner/frontend.js";
import { analyze } from "./analyzer.js";
import type { CheckOptions, CheckResult } from "./types.js";

export type { CheckOptions, CheckResult } from "./types.js";

/**
 * Convert a simple glob pattern (supports `*` as wildcard) to a RegExp.
 * e.g. "support.tickets.*" matches "support.tickets.list", "support.tickets.get"
 */
function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function matchesAnyPattern(apiPath: string, patterns: string[]): boolean {
  return patterns.some((p) => globToRegex(p).test(apiPath));
}

export function checkConvexSync(options: CheckOptions & { convexDir: string; frontendDirs: string[] }): CheckResult {
  const defs = scanBackend(options.convexDir, options.functionWrappers);
  const refs = scanFrontend(options.frontendDirs);

  const { errors, warnings } = analyze(defs, refs);

  // Filter errors/warnings by ignore patterns
  const ignorePatterns = options.ignore ?? [];
  const filteredErrors = ignorePatterns.length > 0
    ? errors.filter((e) => !matchesAnyPattern(e.apiPath, ignorePatterns))
    : errors;

  // Compute stats
  const publicFunctions = defs.filter((d) => !d.isInternal).length;
  const internalFunctions = defs.filter((d) => d.isInternal).length;

  const uniqueRefs = new Set(refs.map((r) => r.apiPath));
  const uniqueModules = new Set(
    defs.map((d) => {
      const parts = d.apiPath.split(".");
      return parts.slice(0, -1).join(".");
    })
  );

  // Filter warnings based on suppressWarnings
  const filteredWarnings = options.suppressWarnings
    ? warnings.filter((w) => !options.suppressWarnings!.includes(w.type))
    : warnings;

  return {
    project: "",
    convexDir: options.convexDir,
    frontendDirs: options.frontendDirs,
    stats: {
      definedFunctions: defs.length,
      publicFunctions,
      internalFunctions,
      frontendRefs: uniqueRefs.size,
      backendModules: uniqueModules.size,
    },
    errors: filteredErrors,
    warnings: filteredWarnings,
    passed: filteredErrors.length === 0,
  };
}
