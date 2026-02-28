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
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { join, dirname } = await import("node:path");
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    console.log(pkg.version);
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

  // Merge ignore patterns from CLI and config
  const cliIgnore = args.ignore ? args.ignore.split(",").map((s) => s.trim()) : [];
  const configIgnore = config.ignore ?? [];
  const ignore = [...cliIgnore, ...configIgnore];

  if (args.verbose) {
    console.log(`Scanning backend: ${convexDir}`);
    console.log(`Scanning frontend: ${frontendDirs.join(", ")}`);
    if (ignore.length > 0) {
      console.log(`Ignoring ${ignore.length} pattern(s)`);
    }
  }

  const result = checkConvexSync({
    convexDir,
    frontendDirs,
    functionWrappers:
      Object.keys(functionWrappers).length > 0 ? functionWrappers : undefined,
    suppressWarnings: suppressWarnings as any,
    ignore: ignore.length > 0 ? ignore : undefined,
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

const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("/cli.js") || process.argv[1].endsWith("/convex-sync-check.mjs"));

if (isDirectRun) {
  main().catch((err) => {
    console.error("Unexpected error:", err.message);
    process.exit(2);
  });
}
