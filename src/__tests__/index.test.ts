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
