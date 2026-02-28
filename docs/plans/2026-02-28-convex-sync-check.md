# Convex Sync Check Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a zero-dependency CLI tool (`@fatagnus/convex-sync-check`) that statically cross-references Convex backend function definitions against frontend `api.*` usage to catch missing definitions, internal function leaks, and dead code.

**Architecture:** Regex-based static analysis in 4 phases: (1) scan backend `.ts` files for exported Convex functions, (2) scan frontend files for `api.*` references, (3) cross-reference to find errors/warnings, (4) optionally check deployed functions. Everything is pure Node.js with zero production dependencies.

**Tech Stack:** TypeScript, Node.js >= 18, `node:util.parseArgs` for CLI, `tsup` for bundling, `vitest` for testing.

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `bin/convex-sync-check.mjs`
- Create: `src/types.ts`

**Step 1: Create package.json**

```json
{
  "name": "@fatagnus/convex-sync-check",
  "version": "0.1.0",
  "description": "Zero-config CLI to check Convex frontend/backend function sync",
  "type": "module",
  "bin": {
    "convex-sync-check": "./bin/convex-sync-check.mjs"
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": [
    "dist",
    "bin"
  ],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "npm run build"
  },
  "keywords": ["convex", "sync", "check", "lint", "static-analysis"],
  "license": "MIT",
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.4.0",
    "vitest": "^3.0.0"
  },
  "engines": {
    "node": ">=18"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create tsup.config.ts**

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  target: "node18",
  splitting: true,
});
```

**Step 4: Create .gitignore**

```
node_modules/
dist/
*.tgz
```

**Step 5: Create bin/convex-sync-check.mjs**

```js
#!/usr/bin/env node
import("../dist/cli.js");
```

**Step 6: Create src/types.ts**

```ts
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
  ignore?: {
    backend?: string[];
    frontend?: string[];
  };
  suppressWarnings?: WarningType[];
  deployed?: boolean;
  verbose?: boolean;
}

export interface ConfigFile {
  convexDir?: string;
  frontendDirs?: string[];
  functionWrappers?: Record<string, "public" | "internal">;
  ignore?: {
    backend?: string[];
    frontend?: string[];
  };
  suppressWarnings?: WarningType[];
}
```

**Step 7: Install dependencies and verify**

Run: `npm install`
Expected: clean install, `node_modules/` created

**Step 8: Commit**

```bash
git add package.json tsconfig.json tsup.config.ts .gitignore bin/ src/types.ts
git commit -m "feat: project scaffolding with types"
```

---

### Task 2: Backend Scanner

**Files:**
- Create: `src/scanner/backend.ts`
- Create: `src/scanner/__tests__/backend.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { scanBackend } from "../backend.js";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function createTempConvex(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "convex-test-"));
  mkdirSync(join(dir, "_generated"), { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

describe("scanBackend", () => {
  it("extracts public query, mutation, action", () => {
    const dir = createTempConvex({
      "users.ts": `
import { query, mutation, action } from "./_generated/server";
export const list = query({ handler: async () => [] });
export const create = mutation({ handler: async () => {} });
export const send = action({ handler: async () => {} });
`,
    });
    const result = scanBackend(dir);
    expect(result).toHaveLength(3);
    expect(result.map((f) => f.apiPath).sort()).toEqual([
      "users.create",
      "users.list",
      "users.send",
    ]);
    expect(result.every((f) => !f.isInternal)).toBe(true);
  });

  it("extracts internal functions and marks them", () => {
    const dir = createTempConvex({
      "admin.ts": `
import { internalQuery, internalMutation, internalAction } from "./_generated/server";
export const getStats = internalQuery({ handler: async () => {} });
export const cleanup = internalMutation({ handler: async () => {} });
export const sync = internalAction({ handler: async () => {} });
`,
    });
    const result = scanBackend(dir);
    expect(result).toHaveLength(3);
    expect(result.every((f) => f.isInternal)).toBe(true);
  });

  it("handles nested directories", () => {
    const dir = createTempConvex({
      "core/users.ts": `
import { query } from "../_generated/server";
export const list = query({ handler: async () => [] });
`,
      "core/teams.ts": `
import { mutation } from "../_generated/server";
export const create = mutation({ handler: async () => {} });
`,
    });
    const result = scanBackend(dir);
    expect(result.map((f) => f.apiPath).sort()).toEqual([
      "core.teams.create",
      "core.users.list",
    ]);
  });

  it("skips _generated, node_modules, test files", () => {
    const dir = createTempConvex({
      "_generated/api.ts": `export const api = {};`,
      "users.test.ts": `export const list = query({});`,
      "users.spec.ts": `export const list = query({});`,
      "real.ts": `
import { query } from "./_generated/server";
export const list = query({ handler: async () => [] });
`,
    });
    const result = scanBackend(dir);
    expect(result).toHaveLength(1);
    expect(result[0].apiPath).toBe("real.list");
  });

  it("recognizes custom function wrappers", () => {
    const dir = createTempConvex({
      "tasks.ts": `
import { authedQuery } from "./helpers";
export const list = authedQuery({ handler: async () => [] });
`,
    });
    const result = scanBackend(dir, {
      authedQuery: "public",
    });
    expect(result).toHaveLength(1);
    expect(result[0].isInternal).toBe(false);
    expect(result[0].type).toBe("authedQuery");
  });

  it("skips httpAction exports", () => {
    const dir = createTempConvex({
      "http.ts": `
import { httpAction } from "./_generated/server";
export const webhook = httpAction(async () => {});
`,
    });
    const result = scanBackend(dir);
    expect(result).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/scanner/__tests__/backend.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```ts
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
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/scanner/__tests__/backend.test.ts`
Expected: All 6 tests PASS

**Step 5: Commit**

```bash
git add src/scanner/
git commit -m "feat: backend scanner with tests"
```

---

### Task 3: Frontend Scanner

**Files:**
- Create: `src/scanner/frontend.ts`
- Create: `src/scanner/__tests__/frontend.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { scanFrontend } from "../frontend.js";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function createTempFrontend(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "frontend-test-"));
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

describe("scanFrontend", () => {
  it("extracts api.module.function references", () => {
    const dir = createTempFrontend({
      "App.tsx": `
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

export function App() {
  const users = useQuery(api.users.list);
  return <div>{users}</div>;
}
`,
    });
    const result = scanFrontend([dir]);
    expect(result).toHaveLength(1);
    expect(result[0].apiPath).toBe("users.list");
  });

  it("extracts deeply nested api paths", () => {
    const dir = createTempFrontend({
      "page.tsx": `
const data = useQuery(api.core.users.getById);
const result = useMutation(api.support.tickets.create);
`,
    });
    const result = scanFrontend([dir]);
    expect(result.map((r) => r.apiPath).sort()).toEqual([
      "core.users.getById",
      "support.tickets.create",
    ]);
  });

  it("handles multiple refs in the same file", () => {
    const dir = createTempFrontend({
      "Dashboard.tsx": `
const users = useQuery(api.users.list);
const teams = useQuery(api.teams.list);
const create = useMutation(api.users.create);
`,
    });
    const result = scanFrontend([dir]);
    expect(result).toHaveLength(3);
  });

  it("skips comment-only lines", () => {
    const dir = createTempFrontend({
      "code.ts": `
// api.old.removed
/* api.also.removed */
const x = useQuery(api.real.function);
`,
    });
    const result = scanFrontend([dir]);
    expect(result).toHaveLength(1);
    expect(result[0].apiPath).toBe("real.function");
  });

  it("skips node_modules and test files", () => {
    const dir = createTempFrontend({
      "node_modules/lib/index.ts": `api.fake.ref`,
      "__tests__/App.test.tsx": `api.test.ref`,
      "App.spec.tsx": `api.spec.ref`,
      "real.tsx": `useQuery(api.real.one)`,
    });
    const result = scanFrontend([dir]);
    expect(result).toHaveLength(1);
    expect(result[0].apiPath).toBe("real.one");
  });

  it("scans multiple frontend directories", () => {
    const dir1 = createTempFrontend({
      "App.tsx": `useQuery(api.users.list)`,
    });
    const dir2 = createTempFrontend({
      "App.tsx": `useMutation(api.teams.create)`,
    });
    const result = scanFrontend([dir1, dir2]);
    expect(result).toHaveLength(2);
  });

  it("handles .js and .jsx files", () => {
    const dir = createTempFrontend({
      "App.jsx": `useQuery(api.users.list)`,
      "util.js": `api.tasks.get`,
    });
    const result = scanFrontend([dir]);
    expect(result).toHaveLength(2);
  });

  it("strips inline comments before matching", () => {
    const dir = createTempFrontend({
      "code.ts": `const x = useQuery(api.real.one); // api.fake.two`,
    });
    const result = scanFrontend([dir]);
    expect(result).toHaveLength(1);
    expect(result[0].apiPath).toBe("real.one");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/scanner/__tests__/frontend.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```ts
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
```

**Step 4: Run tests**

Run: `npx vitest run src/scanner/__tests__/frontend.test.ts`
Expected: All 8 tests PASS

**Step 5: Commit**

```bash
git add src/scanner/frontend.ts src/scanner/__tests__/frontend.test.ts
git commit -m "feat: frontend scanner with tests"
```

---

### Task 4: Analyzer (Cross-Reference)

**Files:**
- Create: `src/analyzer.ts`
- Create: `src/__tests__/analyzer.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { analyze } from "../analyzer.js";
import type { FunctionDef, FrontendRef } from "../types.js";

function makeDef(
  apiPath: string,
  opts?: { isInternal?: boolean; type?: string }
): FunctionDef {
  return {
    name: apiPath.split(".").pop()!,
    apiPath,
    type: opts?.type ?? "query",
    isInternal: opts?.isInternal ?? false,
    file: `convex/${apiPath.replace(/\./g, "/")}.ts`,
    line: 1,
  };
}

function makeRef(apiPath: string, file?: string): FrontendRef {
  return {
    apiPath,
    file: file ?? `src/App.tsx`,
    line: 1,
  };
}

describe("analyze", () => {
  it("reports MISSING_DEFINITION for refs with no backend def", () => {
    const defs = [makeDef("users.list")];
    const refs = [makeRef("users.list"), makeRef("users.create")];
    const result = analyze(defs, refs);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].type).toBe("MISSING_DEFINITION");
    expect(result.errors[0].apiPath).toBe("users.create");
  });

  it("reports INTERNAL_CALLED_FROM_FRONTEND", () => {
    const defs = [makeDef("admin.cleanup", { isInternal: true })];
    const refs = [makeRef("admin.cleanup")];
    const result = analyze(defs, refs);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].type).toBe("INTERNAL_CALLED_FROM_FRONTEND");
  });

  it("reports UNREFERENCED for public defs with no frontend refs", () => {
    const defs = [makeDef("users.list"), makeDef("users.archive")];
    const refs = [makeRef("users.list")];
    const result = analyze(defs, refs);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].type).toBe("UNREFERENCED");
    expect(result.warnings[0].apiPath).toBe("users.archive");
  });

  it("does not warn about unreferenced internal functions", () => {
    const defs = [
      makeDef("users.list"),
      makeDef("admin.sync", { isInternal: true }),
    ];
    const refs = [makeRef("users.list")];
    const result = analyze(defs, refs);
    expect(result.warnings).toHaveLength(0);
  });

  it("groups multiple locations for same missing path", () => {
    const defs: FunctionDef[] = [];
    const refs = [
      makeRef("users.create", "src/A.tsx"),
      makeRef("users.create", "src/B.tsx"),
    ];
    const result = analyze(defs, refs);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].locations).toHaveLength(2);
  });

  it("returns passed=true when no errors", () => {
    const defs = [makeDef("users.list")];
    const refs = [makeRef("users.list")];
    const result = analyze(defs, refs);
    expect(result.errors).toHaveLength(0);
    expect(result.passed).toBe(true);
  });

  it("returns passed=false when errors exist", () => {
    const defs: FunctionDef[] = [];
    const refs = [makeRef("users.list")];
    const result = analyze(defs, refs);
    expect(result.passed).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/analyzer.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```ts
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
```

**Step 4: Run tests**

Run: `npx vitest run src/__tests__/analyzer.test.ts`
Expected: All 7 tests PASS

**Step 5: Commit**

```bash
git add src/analyzer.ts src/__tests__/analyzer.test.ts
git commit -m "feat: cross-reference analyzer with tests"
```

---

### Task 5: Project Layout Detector

**Files:**
- Create: `src/detector.ts`
- Create: `src/__tests__/detector.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { detectLayout } from "../detector.js";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function createProject(structure: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "project-test-"));
  for (const [path, content] of Object.entries(structure)) {
    const full = join(dir, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

describe("detectLayout", () => {
  it("detects standard single-project layout", () => {
    const dir = createProject({
      "package.json": JSON.stringify({ dependencies: { convex: "^1.0" } }),
      "convex/_generated/api.ts": "export const api = {};",
      "convex/users.ts": "export const list = query({});",
      "src/App.tsx": "import { api } from '../convex/_generated/api';",
    });
    const result = detectLayout(dir);
    expect(result.convexDir).toBe(join(dir, "convex"));
    expect(result.frontendDirs).toContain(join(dir, "src"));
  });

  it("detects app/ as frontend directory", () => {
    const dir = createProject({
      "package.json": JSON.stringify({ dependencies: { convex: "^1.0" } }),
      "convex/_generated/api.ts": "",
      "app/page.tsx": "import { api } from '../convex/_generated/api';",
    });
    const result = detectLayout(dir);
    expect(result.frontendDirs).toContain(join(dir, "app"));
  });

  it("returns null when no convex dir found", () => {
    const dir = createProject({
      "package.json": JSON.stringify({}),
      "src/App.tsx": "",
    });
    const result = detectLayout(dir);
    expect(result.convexDir).toBeNull();
  });

  it("returns project name from package.json", () => {
    const dir = createProject({
      "package.json": JSON.stringify({ name: "my-app", dependencies: { convex: "^1.0" } }),
      "convex/_generated/api.ts": "",
      "src/App.tsx": "",
    });
    const result = detectLayout(dir);
    expect(result.project).toBe("my-app");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/detector.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```ts
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";

interface LayoutResult {
  project: string;
  convexDir: string | null;
  frontendDirs: string[];
}

const FRONTEND_DIRS = ["src", "app", "pages"];

export function detectLayout(cwd: string): LayoutResult {
  const project = getProjectName(cwd);
  const convexDir = findConvexDir(cwd);
  const frontendDirs = findFrontendDirs(cwd);

  return { project, convexDir, frontendDirs };
}

function getProjectName(cwd: string): string {
  const pkgPath = join(cwd, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.name) return pkg.name;
    } catch {}
  }
  return basename(cwd);
}

function findConvexDir(cwd: string): string | null {
  const candidate = join(cwd, "convex");
  if (
    existsSync(candidate) &&
    statSync(candidate).isDirectory() &&
    existsSync(join(candidate, "_generated"))
  ) {
    return candidate;
  }
  return null;
}

function findFrontendDirs(cwd: string): string[] {
  const dirs: string[] = [];
  for (const name of FRONTEND_DIRS) {
    const candidate = join(cwd, name);
    if (existsSync(candidate) && statSync(candidate).isDirectory()) {
      if (containsSourceFiles(candidate)) {
        dirs.push(candidate);
      }
    }
  }
  return dirs;
}

function containsSourceFiles(dir: string): boolean {
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (/\.(tsx?|jsx?)$/.test(entry)) return true;
      const full = join(dir, entry);
      if (statSync(full).isDirectory() && entry !== "node_modules") {
        if (containsSourceFiles(full)) return true;
      }
    }
  } catch {}
  return false;
}
```

**Step 4: Run tests**

Run: `npx vitest run src/__tests__/detector.test.ts`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add src/detector.ts src/__tests__/detector.test.ts
git commit -m "feat: project layout auto-detector with tests"
```

---

### Task 6: Reporters (Human + JSON)

**Files:**
- Create: `src/reporter/human.ts`
- Create: `src/reporter/json.ts`
- Create: `src/reporter/__tests__/reporter.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { formatHuman } from "../human.js";
import { formatJson } from "../json.js";
import type { CheckResult } from "../../types.js";

const baseResult: CheckResult = {
  project: "my-app",
  convexDir: "convex/",
  frontendDirs: ["src/"],
  stats: {
    definedFunctions: 10,
    publicFunctions: 8,
    internalFunctions: 2,
    frontendRefs: 5,
    backendModules: 3,
  },
  errors: [],
  warnings: [],
  passed: true,
};

describe("formatHuman", () => {
  it("shows PASS when no errors", () => {
    const output = formatHuman(baseResult);
    expect(output).toContain("PASS");
    expect(output).toContain("my-app");
  });

  it("shows FAIL with missing definitions", () => {
    const result: CheckResult = {
      ...baseResult,
      passed: false,
      errors: [
        {
          type: "MISSING_DEFINITION",
          apiPath: "users.create",
          locations: [{ file: "src/App.tsx", line: 33 }],
        },
      ],
    };
    const output = formatHuman(result);
    expect(output).toContain("FAIL");
    expect(output).toContain("api.users.create");
    expect(output).toContain("src/App.tsx:33");
  });

  it("shows internal function leak errors", () => {
    const result: CheckResult = {
      ...baseResult,
      passed: false,
      errors: [
        {
          type: "INTERNAL_CALLED_FROM_FRONTEND",
          apiPath: "admin.cleanup",
          locations: [{ file: "src/Admin.tsx", line: 10 }],
        },
      ],
    };
    const output = formatHuman(result);
    expect(output).toContain("FAIL");
    expect(output).toContain("api.admin.cleanup");
    expect(output).toContain("internal");
  });

  it("shows unreferenced warnings", () => {
    const result: CheckResult = {
      ...baseResult,
      warnings: [
        {
          type: "UNREFERENCED",
          apiPath: "users.archive",
          definition: { type: "mutation", file: "convex/users.ts", line: 20 },
        },
      ],
    };
    const output = formatHuman(result);
    expect(output).toContain("api.users.archive");
  });
});

describe("formatJson", () => {
  it("returns valid JSON matching CheckResult shape", () => {
    const output = formatJson(baseResult);
    const parsed = JSON.parse(output);
    expect(parsed.project).toBe("my-app");
    expect(parsed.passed).toBe(true);
    expect(parsed.errors).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/reporter/__tests__/reporter.test.ts`
Expected: FAIL

**Step 3: Write human reporter**

```ts
import type { CheckResult } from "../types.js";

export function formatHuman(result: CheckResult): string {
  const lines: string[] = [];

  lines.push("");
  lines.push("═══ Convex Function Sync Check ═══");
  lines.push("");
  lines.push(`  Project:           ${result.project}`);
  lines.push(`  Convex dir:        ${result.convexDir}`);
  lines.push(`  Frontend dir:      ${result.frontendDirs.join(", ")}`);
  lines.push(
    `  Defined functions: ${result.stats.definedFunctions} (${result.stats.publicFunctions} public, ${result.stats.internalFunctions} internal)`
  );
  lines.push(`  Frontend refs:     ${result.stats.frontendRefs} unique api paths`);
  lines.push(`  Backend modules:   ${result.stats.backendModules}`);
  lines.push("");

  const missingDefs = result.errors.filter(
    (e) => e.type === "MISSING_DEFINITION"
  );
  const internalLeaks = result.errors.filter(
    (e) => e.type === "INTERNAL_CALLED_FROM_FRONTEND"
  );
  const notDeployed = result.errors.filter(
    (e) => e.type === "NOT_DEPLOYED"
  );

  if (missingDefs.length > 0) {
    lines.push(
      `✗ ${missingDefs.length} function(s) referenced but NOT defined:`
    );
    lines.push("");
    for (const err of missingDefs) {
      lines.push(`  ✗ api.${err.apiPath}`);
      for (const loc of err.locations) {
        lines.push(`    → ${loc.file}:${loc.line}`);
      }
      lines.push("");
    }
  }

  if (internalLeaks.length > 0) {
    lines.push(
      `✗ ${internalLeaks.length} internal function(s) called from frontend:`
    );
    lines.push("");
    for (const err of internalLeaks) {
      lines.push(`  ✗ api.${err.apiPath} (internal — should not be called from frontend)`);
      for (const loc of err.locations) {
        lines.push(`    → ${loc.file}:${loc.line}`);
      }
      lines.push("");
    }
  }

  if (notDeployed.length > 0) {
    lines.push(
      `✗ ${notDeployed.length} function(s) defined but NOT deployed:`
    );
    lines.push("");
    for (const err of notDeployed) {
      lines.push(`  ✗ api.${err.apiPath}`);
      for (const loc of err.locations) {
        lines.push(`    → ${loc.file}:${loc.line}`);
      }
      lines.push("");
    }
  }

  if (result.warnings.length > 0) {
    lines.push(
      `⚠ ${result.warnings.length} public function(s) defined but not referenced from frontend:`
    );
    lines.push("");
    for (const warn of result.warnings) {
      lines.push(`  ○ api.${warn.apiPath} (${warn.definition.type})`);
      lines.push(`    ${warn.definition.file}:${warn.definition.line}`);
    }
    lines.push("");
  }

  if (result.passed) {
    lines.push("PASS — All Convex function references are in sync.");
  } else {
    lines.push("FAIL — Convex function sync issues found.");
  }

  lines.push("");
  return lines.join("\n");
}
```

**Step 4: Write JSON reporter**

```ts
import type { CheckResult } from "../types.js";

export function formatJson(result: CheckResult): string {
  return JSON.stringify(result, null, 2);
}
```

**Step 5: Run tests**

Run: `npx vitest run src/reporter/__tests__/reporter.test.ts`
Expected: All 5 tests PASS

**Step 6: Commit**

```bash
git add src/reporter/
git commit -m "feat: human and JSON reporters with tests"
```

---

### Task 7: Config File Loader

**Files:**
- Create: `src/config.ts`
- Create: `src/__tests__/config.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { loadConfig } from "../config.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("loadConfig", () => {
  it("returns empty config when no file exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "config-test-"));
    const result = loadConfig(dir);
    expect(result).toEqual({});
  });

  it("loads .convex-sync-check.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "config-test-"));
    writeFileSync(
      join(dir, ".convex-sync-check.json"),
      JSON.stringify({
        convexDir: "packages/backend/convex",
        frontendDirs: ["apps/web/src"],
        functionWrappers: { authedQuery: "public" },
      })
    );
    const result = loadConfig(dir);
    expect(result.convexDir).toBe("packages/backend/convex");
    expect(result.functionWrappers?.authedQuery).toBe("public");
  });

  it("loads from custom path", () => {
    const dir = mkdtempSync(join(tmpdir(), "config-test-"));
    writeFileSync(
      join(dir, "custom.json"),
      JSON.stringify({ convexDir: "custom/convex" })
    );
    const result = loadConfig(dir, join(dir, "custom.json"));
    expect(result.convexDir).toBe("custom/convex");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/config.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ConfigFile } from "./types.js";

const DEFAULT_CONFIG_NAME = ".convex-sync-check.json";

export function loadConfig(cwd: string, configPath?: string): ConfigFile {
  const path = configPath ?? join(cwd, DEFAULT_CONFIG_NAME);

  if (!existsSync(path)) {
    return {};
  }

  try {
    const content = readFileSync(path, "utf-8");
    return JSON.parse(content) as ConfigFile;
  } catch (err) {
    throw new Error(`Failed to parse config file ${path}: ${(err as Error).message}`);
  }
}
```

**Step 4: Run tests**

Run: `npx vitest run src/__tests__/config.test.ts`
Expected: All 3 tests PASS

**Step 5: Commit**

```bash
git add src/config.ts src/__tests__/config.test.ts
git commit -m "feat: config file loader with tests"
```

---

### Task 8: Main Entry (Programmatic API)

**Files:**
- Create: `src/index.ts`
- Create: `src/__tests__/index.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { checkConvexSync } from "../index.js";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function createFullProject(
  backend: Record<string, string>,
  frontend: Record<string, string>
): { convexDir: string; frontendDir: string } {
  const root = mkdtempSync(join(tmpdir(), "full-test-"));
  const convexDir = join(root, "convex");
  const frontendDir = join(root, "src");

  mkdirSync(join(convexDir, "_generated"), { recursive: true });
  mkdirSync(frontendDir, { recursive: true });

  for (const [path, content] of Object.entries(backend)) {
    const full = join(convexDir, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  for (const [path, content] of Object.entries(frontend)) {
    const full = join(frontendDir, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return { convexDir, frontendDir };
}

describe("checkConvexSync", () => {
  it("returns passed=true when everything is in sync", () => {
    const { convexDir, frontendDir } = createFullProject(
      {
        "users.ts": `
import { query } from "./_generated/server";
export const list = query({ handler: async () => [] });
`,
      },
      {
        "App.tsx": `useQuery(api.users.list)`,
      }
    );

    const result = checkConvexSync({ convexDir, frontendDirs: [frontendDir] });
    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("detects missing backend definitions", () => {
    const { convexDir, frontendDir } = createFullProject(
      {
        "users.ts": `
import { query } from "./_generated/server";
export const list = query({ handler: async () => [] });
`,
      },
      {
        "App.tsx": `
useQuery(api.users.list);
useMutation(api.users.create);
`,
      }
    );

    const result = checkConvexSync({ convexDir, frontendDirs: [frontendDir] });
    expect(result.passed).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].apiPath).toBe("users.create");
  });

  it("populates stats correctly", () => {
    const { convexDir, frontendDir } = createFullProject(
      {
        "users.ts": `
import { query, mutation } from "./_generated/server";
import { internalQuery } from "./_generated/server";
export const list = query({ handler: async () => [] });
export const create = mutation({ handler: async () => {} });
export const adminList = internalQuery({ handler: async () => [] });
`,
      },
      {
        "App.tsx": `
useQuery(api.users.list);
useMutation(api.users.create);
`,
      }
    );

    const result = checkConvexSync({ convexDir, frontendDirs: [frontendDir] });
    expect(result.stats.definedFunctions).toBe(3);
    expect(result.stats.publicFunctions).toBe(2);
    expect(result.stats.internalFunctions).toBe(1);
    expect(result.stats.frontendRefs).toBe(2);
    expect(result.stats.backendModules).toBe(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/index.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```ts
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
```

**Step 4: Run tests**

Run: `npx vitest run src/__tests__/index.test.ts`
Expected: All 3 tests PASS

**Step 5: Commit**

```bash
git add src/index.ts src/__tests__/index.test.ts
git commit -m "feat: programmatic API entry point with tests"
```

---

### Task 9: CLI

**Files:**
- Create: `src/cli.ts`
- Create: `src/__tests__/cli.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { parseCliArgs } from "../cli.js";

describe("parseCliArgs", () => {
  it("parses --json flag", () => {
    const result = parseCliArgs(["--json"]);
    expect(result.json).toBe(true);
  });

  it("parses --convex-dir", () => {
    const result = parseCliArgs(["--convex-dir", "packages/convex"]);
    expect(result.convexDir).toBe("packages/convex");
  });

  it("parses --frontend-dir", () => {
    const result = parseCliArgs(["--frontend-dir", "apps/web/src"]);
    expect(result.frontendDir).toBe("apps/web/src");
  });

  it("parses --deployed flag", () => {
    const result = parseCliArgs(["--deployed"]);
    expect(result.deployed).toBe(true);
  });

  it("parses --no-warnings flag", () => {
    const result = parseCliArgs(["--no-warnings"]);
    expect(result.noWarnings).toBe(true);
  });

  it("parses --verbose flag", () => {
    const result = parseCliArgs(["--verbose"]);
    expect(result.verbose).toBe(true);
  });

  it("returns defaults when no args", () => {
    const result = parseCliArgs([]);
    expect(result.json).toBe(false);
    expect(result.deployed).toBe(false);
    expect(result.verbose).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/cli.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```ts
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { checkConvexSync } from "./index.js";
import { loadConfig } from "./config.js";
import { detectLayout } from "./detector.js";
import { formatHuman } from "./reporter/human.js";
import { formatJson } from "./reporter/json.js";

interface CliArgs {
  convexDir?: string;
  frontendDir?: string;
  deployed: boolean;
  json: boolean;
  noWarnings: boolean;
  ignore?: string;
  config?: string;
  verbose: boolean;
  version: boolean;
  help: boolean;
}

export function parseCliArgs(argv: string[]): CliArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      "convex-dir": { type: "string" },
      "frontend-dir": { type: "string" },
      deployed: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      "no-warnings": { type: "boolean", default: false },
      ignore: { type: "string" },
      config: { type: "string" },
      verbose: { type: "boolean", short: "v", default: false },
      version: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    strict: true,
  });

  return {
    convexDir: values["convex-dir"] as string | undefined,
    frontendDir: values["frontend-dir"] as string | undefined,
    deployed: values.deployed as boolean,
    json: values.json as boolean,
    noWarnings: values["no-warnings"] as boolean,
    ignore: values.ignore as string | undefined,
    config: values.config as string | undefined,
    verbose: values.verbose as boolean,
    version: values.version as boolean,
    help: values.help as boolean,
  };
}

const HELP_TEXT = `
Usage: convex-sync-check [options]

Options:
  --convex-dir <path>     Path to convex/ directory (auto-detected if omitted)
  --frontend-dir <path>   Path to frontend source directory (auto-detected if omitted)
  --deployed              Also check deployed functions via \`npx convex functions\`
  --json                  Output as JSON (for programmatic consumption)
  --no-warnings           Suppress unreferenced function warnings
  --ignore <patterns>     Comma-separated glob patterns to ignore
  --config <path>         Path to config file (default: .convex-sync-check.json)
  -v, --verbose           Show detailed scan progress
  --version               Show version
  --help                  Show help
`.trim();

export async function main() {
  const args = parseCliArgs(process.argv.slice(2));

  if (args.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  if (args.version) {
    console.log("0.1.0");
    process.exit(0);
  }

  const cwd = process.cwd();

  // Load config file
  const config = loadConfig(cwd, args.config);

  // Detect or use explicit paths
  const layout = detectLayout(cwd);

  const convexDir = resolve(
    cwd,
    args.convexDir ?? config.convexDir ?? (layout.convexDir ?? "")
  );
  if (!convexDir || !existsSync(convexDir)) {
    console.error(
      "Error: Could not find convex/ directory. Use --convex-dir to specify."
    );
    process.exit(2);
  }

  const frontendDirs = args.frontendDir
    ? [resolve(cwd, args.frontendDir)]
    : (config.frontendDirs ?? []).length > 0
      ? config.frontendDirs!.map((d) => resolve(cwd, d))
      : layout.frontendDirs;

  if (frontendDirs.length === 0) {
    console.error(
      "Error: Could not find frontend source directory. Use --frontend-dir to specify."
    );
    process.exit(2);
  }

  // Merge function wrappers
  const functionWrappers = {
    ...config.functionWrappers,
  };

  const suppressWarnings = args.noWarnings
    ? (["UNREFERENCED"] as const)
    : config.suppressWarnings;

  if (args.verbose) {
    console.log(`Scanning backend: ${convexDir}`);
    console.log(`Scanning frontend: ${frontendDirs.join(", ")}`);
  }

  const result = checkConvexSync({
    convexDir,
    frontendDirs,
    functionWrappers:
      Object.keys(functionWrappers).length > 0 ? functionWrappers : undefined,
    suppressWarnings: suppressWarnings as any,
    verbose: args.verbose,
  });

  result.project = layout.project;
  result.convexDir = convexDir;
  result.frontendDirs = frontendDirs;

  if (args.json) {
    console.log(formatJson(result));
  } else {
    console.log(formatHuman(result));
  }

  process.exit(result.passed ? 0 : 1);
}

main().catch((err) => {
  console.error("Unexpected error:", err.message);
  process.exit(2);
});
```

**Step 4: Run tests**

Run: `npx vitest run src/__tests__/cli.test.ts`
Expected: All 7 tests PASS

**Step 5: Commit**

```bash
git add src/cli.ts src/__tests__/cli.test.ts
git commit -m "feat: CLI with argument parsing"
```

---

### Task 10: Build, Integration Test, Finalize

**Files:**
- Modify: `bin/convex-sync-check.mjs` (ensure executable)

**Step 1: Build the project**

Run: `npm run build`
Expected: `dist/` created with `index.js`, `cli.js`, and `.d.ts` files

**Step 2: Make bin executable**

Run: `chmod +x bin/convex-sync-check.mjs`

**Step 3: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: No TypeScript errors

**Step 5: Manual smoke test** (create a temp convex project and run the CLI)

Run: `node bin/convex-sync-check.mjs --help`
Expected: Help text displayed

**Step 6: Commit and push**

```bash
git add -A
git commit -m "feat: build and finalize v0.1.0"
git push
```

---
