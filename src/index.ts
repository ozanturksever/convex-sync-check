import { scanBackend } from "./scanner/backend.js";
import { scanFrontend } from "./scanner/frontend.js";
import { analyze } from "./analyzer.js";
import type { CheckOptions, CheckResult } from "./types.js";

export type { CheckOptions, CheckResult } from "./types.js";

export function checkConvexSync(options: CheckOptions & { convexDir: string; frontendDirs: string[] }): CheckResult {
  const defs = scanBackend(options.convexDir, options.functionWrappers);
  const refs = scanFrontend(options.frontendDirs);

  const { errors, warnings, passed } = analyze(defs, refs);

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
    errors,
    warnings: filteredWarnings,
    passed,
  };
}
