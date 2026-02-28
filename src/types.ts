export interface FunctionDef {
  name: string;
  apiPath: string;
  type: string;
  isInternal: boolean;
  file: string;
  line: number;
}

export interface FrontendRef {
  apiPath: string;
  file: string;
  line: number;
}

export type ErrorType = "MISSING_DEFINITION" | "INTERNAL_CALLED_FROM_FRONTEND" | "NOT_DEPLOYED";
export type WarningType = "UNREFERENCED";

export interface SyncError {
  type: ErrorType;
  apiPath: string;
  locations: Array<{ file: string; line: number }>;
}

export interface SyncWarning {
  type: WarningType;
  apiPath: string;
  definition: {
    type: string;
    file: string;
    line: number;
  };
}

export interface ScanStats {
  definedFunctions: number;
  publicFunctions: number;
  internalFunctions: number;
  frontendRefs: number;
  backendModules: number;
}

export interface CheckResult {
  project: string;
  convexDir: string;
  frontendDirs: string[];
  stats: ScanStats;
  errors: SyncError[];
  warnings: SyncWarning[];
  passed: boolean;
}

export interface CheckOptions {
  convexDir?: string;
  frontendDirs?: string[];
  functionWrappers?: Record<string, "public" | "internal">;
  ignore?: string[];
  suppressWarnings?: WarningType[];
  deployed?: boolean;
  verbose?: boolean;
}

export interface ConfigFile {
  convexDir?: string;
  frontendDirs?: string[];
  functionWrappers?: Record<string, "public" | "internal">;
  ignore?: string[];
  suppressWarnings?: WarningType[];
}
