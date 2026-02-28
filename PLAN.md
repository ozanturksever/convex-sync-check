# `@fatagnus/convex-sync-check` — Spec / PRD

## Problem

Convex auto-generates `_generated/api.ts` with full TypeScript types for all backend functions. However:

1. **Stale generated types** — If a backend function is renamed or deleted but `npx convex dev` hasn't re-generated types, `tsc` still sees the old types and reports no errors. The frontend compiles clean but crashes at runtime.
2. **Missing implementations** — Frontend code can reference `api.foo.bar` that was never implemented. If the generated types are loose or stale, `tsc` won't catch it.
3. **Internal function leaks** — `internalQuery`/`internalMutation`/`internalAction` should never be called from the frontend client. `tsc` doesn't enforce this boundary.
4. **Deploy drift** — Backend functions exist in source but aren't deployed. Frontend calls them and gets runtime errors.

These are **not caught by `tsc --noEmit`** because TypeScript trusts the generated types. A static source-level cross-reference catches them instantly.

## Solution

A zero-config CLI tool published as `@fatagnus/convex-sync-check`, runnable via:

```bash
npx @fatagnus/convex-sync-check
```

It performs source-level static analysis — no build step, no TypeScript compilation, no Convex runtime needed.

## User Stories

1. **As a developer**, I run `npx @fatagnus/convex-sync-check` in my project root and instantly see if any frontend `api.*` references point to non-existent backend functions.
2. **As a CI pipeline**, I run the check as a pre-deploy gate. Exit code 1 = broken references exist.
3. **As a team lead**, I see a report of unreferenced public functions (dead code candidates).
4. **As a developer**, I run `npx @fatagnus/convex-sync-check --deployed` to also verify that locally-defined functions are actually deployed.

## CLI Interface

```
Usage: convex-sync-check [options]

Options:
  --convex-dir <path>     Path to convex/ directory (auto-detected if omitted)
  --frontend-dir <path>   Path to frontend source directory (auto-detected if omitted)
  --deployed              Also check deployed functions via `npx convex functions`
  --json                  Output as JSON (for programmatic consumption)
  --no-warnings           Suppress unreferenced function warnings
  --ignore <patterns>     Comma-separated glob patterns to ignore (e.g., "**/*.test.ts")
  --config <path>         Path to config file (default: .convex-sync-check.json)
  -v, --verbose           Show detailed scan progress
  --version               Show version
  --help                  Show help
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All checks pass |
| 1 | Errors found (missing definitions or internal function leaks) |
| 2 | Configuration error (directories not found, etc.) |

## Auto-Detection

The tool should work zero-config for common Convex project layouts:

### Detection Strategy (in order)

1. **Look for `convex/` directory** — starting from CWD, walk up to find a `convex/` directory containing `_generated/`.
2. **Check `package.json`** — look for a `convex` dependency to confirm it's a Convex project.
3. **Monorepo support** — if the root has `workspaces` in `package.json`, scan each workspace for `convex/` dirs and frontend source dirs.
4. **Frontend source** — look for `src/`, `app/`, or `pages/` directories containing `.tsx`/`.ts` files that import from `convex/_generated/api`.

### Common Layouts Supported

```
# Single project
my-app/
  convex/           ← auto-detected
  src/              ← auto-detected

# Monorepo (workspaces)
my-app/
  packages/convex/convex/    ← auto-detected via workspace scan
  apps/web/src/              ← auto-detected via workspace scan

# Multiple frontend apps
my-app/
  convex/
  apps/web/src/
  apps/mobile/src/           ← all scanned
```

## Analysis Engine

### Phase 1: Scan Backend

Recursively find all `.ts` files in the convex directory (excluding `_generated/`, `node_modules/`, `*.test.ts`, `*.spec.ts`).

Extract exported Convex functions matching:

```
export const NAME = FUNCTION_TYPE(
```

Where `FUNCTION_TYPE` is one of:
- `query`, `mutation`, `action` (public)
- `internalQuery`, `internalMutation`, `internalAction` (internal)
- Common wrappers: `authedQuery`, `authedMutation`, `authedAction` (treated as public)
- `httpAction` (public, but not callable via `api.*` — excluded from cross-reference)

**Extensibility:** The config file can declare additional wrapper function names and whether they're public or internal:

```json
{
  "functionWrappers": {
    "authedQuery": "public",
    "authedMutation": "public",
    "adminQuery": "public",
    "systemMutation": "internal"
  }
}
```

Build a map: `"module.path.functionName"` → `{ type, isInternal, file, line }`

Module path is derived from the file path relative to the convex directory, with `/` replaced by `.` and `.ts` stripped.

### Phase 2: Scan Frontend

Recursively find all `.ts`, `.tsx`, `.js`, `.jsx` files in the frontend source directory (excluding `node_modules/`, `__tests__/`, `*.test.*`, `*.spec.*`).

Extract all `api.xxx.yyy` references using regex:

```
\bapi\.([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)+)
```

Skip comment-only lines (`//`, `*`). Strip inline comments before matching.

Build a map: `"module.path.functionName"` → `[{ file, line }]`

### Phase 3: Cross-Reference

**Errors (exit code 1):**

| Check | Severity | Description |
|-------|----------|-------------|
| `MISSING_DEFINITION` | Error | Frontend references `api.x.y` but no matching export exists in backend |
| `INTERNAL_CALLED_FROM_FRONTEND` | Error | Frontend references a function exported as `internalQuery`/`internalMutation`/`internalAction` |

**Warnings (informational):**

| Check | Severity | Description |
|-------|----------|-------------|
| `UNREFERENCED` | Warning | Public function defined in backend but never referenced from frontend |

### Phase 4 (optional): Deployed Check

When `--deployed` is passed:

1. Run `npx convex functions` and parse output
2. For each frontend reference that has a valid backend definition, verify it exists in the deployed function list
3. Report `NOT_DEPLOYED` errors for any mismatch

## Output Formats

### Default (human-readable)

```
═══ Convex Function Sync Check ═══

  Project:           my-app
  Convex dir:        convex/
  Frontend dir:      src/
  Defined functions: 142 (128 public, 14 internal)
  Frontend refs:     87 unique api paths
  Backend modules:   23

✗ 2 function(s) referenced but NOT defined:

  ✗ api.support.kbBookmarks.isCustomerBookmarked
    → src/components/kb/BookmarkToggle.tsx:33

  ✗ api.support.kbRatings.getCustomerRating
    → src/components/kb/StarRating.tsx:35

⚠ 12 public function(s) defined but not referenced from frontend:

  ○ api.core.regions.list (query)
    convex/core/regions.ts:11

FAIL — Convex function sync issues found.
```

### JSON (`--json`)

```json
{
  "project": "my-app",
  "convexDir": "convex/",
  "frontendDir": "src/",
  "stats": {
    "definedFunctions": 142,
    "publicFunctions": 128,
    "internalFunctions": 14,
    "frontendRefs": 87,
    "backendModules": 23
  },
  "errors": [
    {
      "type": "MISSING_DEFINITION",
      "apiPath": "support.kbBookmarks.isCustomerBookmarked",
      "locations": [
        { "file": "src/components/kb/BookmarkToggle.tsx", "line": 33 }
      ]
    }
  ],
  "warnings": [
    {
      "type": "UNREFERENCED",
      "apiPath": "core.regions.list",
      "definition": {
        "type": "query",
        "file": "convex/core/regions.ts",
        "line": 11
      }
    }
  ],
  "passed": false
}
```

## Config File

Optional `.convex-sync-check.json` at project root:

```json
{
  "convexDir": "packages/backend/convex",
  "frontendDirs": ["apps/web/src", "apps/mobile/src"],
  "functionWrappers": {
    "authedQuery": "public",
    "authedMutation": "public",
    "authedAction": "public"
  },
  "ignore": {
    "backend": ["**/test-helpers/**"],
    "frontend": ["**/*.test.tsx", "**/__mocks__/**"]
  },
  "suppressWarnings": ["UNREFERENCED"]
}
```

## Package Structure

```
@fatagnus/convex-sync-check/
├── package.json
├── bin/
│   └── convex-sync-check.mjs      # CLI entry point (#!/usr/bin/env node)
├── src/
│   ├── index.ts                    # Programmatic API
│   ├── cli.ts                      # CLI argument parsing
│   ├── scanner/
│   │   ├── backend.ts              # Convex function extraction
│   │   └── frontend.ts             # api.* reference extraction
│   ├── analyzer.ts                 # Cross-reference logic
│   ├── detector.ts                 # Auto-detection of project layout
│   ├── deployed.ts                 # Optional deployed function check
│   ├── reporter/
│   │   ├── human.ts                # Human-readable output
│   │   └── json.ts                 # JSON output
│   └── types.ts                    # Shared types
├── tsconfig.json
└── README.md
```

## Tech Stack

- **Runtime:** Node.js >= 18 (no dependencies for core functionality)
- **CLI parsing:** `node:util.parseArgs` (zero dependencies)
- **File system:** `node:fs`, `node:path` (zero dependencies)
- **Build:** `tsup` (single-file ESM bundle for fast `npx` startup)
- **Testing:** `vitest`

**Goal: zero production dependencies.** The tool should `npx` instantly without downloading a dependency tree.

## Programmatic API

```ts
import { checkConvexSync } from "@fatagnus/convex-sync-check";

const result = await checkConvexSync({
  convexDir: "convex/",
  frontendDirs: ["src/"],
  functionWrappers: { authedQuery: "public" },
});

console.log(result.passed);       // boolean
console.log(result.errors);       // Error[]
console.log(result.warnings);     // Warning[]
```

This enables integration into custom build scripts, CI pipelines, or editor plugins.

## CI Integration Examples

### GitHub Actions

```yaml
- name: Check Convex sync
  run: npx @fatagnus/convex-sync-check
```

### Pre-commit hook

```json
{
  "husky": {
    "hooks": {
      "pre-commit": "npx @fatagnus/convex-sync-check"
    }
  }
}
```

## Non-Goals (v1)

- **No AST parsing** — regex-based extraction is fast and sufficient. AST parsing adds complexity and dependencies without meaningful accuracy improvement for this use case.
- **No argument validation** — the tool checks function existence, not whether frontend passes correct arguments. That's `tsc`'s job (when generated types are fresh).
- **No auto-fix** — the tool reports; it doesn't generate missing functions or remove dead code.
- **No watch mode** — this is a one-shot check, not a daemon.

## Success Criteria

1. Runs in < 2 seconds on a 1000-function / 500-file project
2. Zero false positives on standard Convex project layouts
3. Catches all 5 missing functions found in the kure codebase
4. Works via `npx` with zero install (no production dependencies)
5. Exits with correct code for CI gating
