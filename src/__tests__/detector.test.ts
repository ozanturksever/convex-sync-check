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
