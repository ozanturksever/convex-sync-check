import type {
  FunctionDef,
  FrontendRef,
  SyncError,
  SyncWarning,
} from "./types.js";

interface AnalyzeResult {
  errors: SyncError[];
  warnings: SyncWarning[];
  passed: boolean;
}

export function analyze(
  defs: FunctionDef[],
  refs: FrontendRef[]
): AnalyzeResult {
  const defMap = new Map<string, FunctionDef>();
  for (const def of defs) {
    defMap.set(def.apiPath, def);
  }

  // Group refs by apiPath
  const refGroups = new Map<string, Array<{ file: string; line: number }>>();
  for (const ref of refs) {
    const group = refGroups.get(ref.apiPath) ?? [];
    group.push({ file: ref.file, line: ref.line });
    refGroups.set(ref.apiPath, group);
  }

  const errors: SyncError[] = [];

  // Check each referenced path
  for (const [apiPath, locations] of refGroups) {
    const def = defMap.get(apiPath);
    if (!def) {
      errors.push({
        type: "MISSING_DEFINITION",
        apiPath,
        locations,
      });
    } else if (def.isInternal) {
      errors.push({
        type: "INTERNAL_CALLED_FROM_FRONTEND",
        apiPath,
        locations,
      });
    }
  }

  // Find unreferenced public functions
  const warnings: SyncWarning[] = [];
  for (const def of defs) {
    if (!def.isInternal && !refGroups.has(def.apiPath)) {
      warnings.push({
        type: "UNREFERENCED",
        apiPath: def.apiPath,
        definition: {
          type: def.type,
          file: def.file,
          line: def.line,
        },
      });
    }
  }

  return {
    errors,
    warnings,
    passed: errors.length === 0,
  };
}
