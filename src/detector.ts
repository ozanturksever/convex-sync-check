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
