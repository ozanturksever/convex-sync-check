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
