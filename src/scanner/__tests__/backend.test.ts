import { describe, it, expect } from "vitest";
import { scanBackend, detectWrappers } from "../backend.js";
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

  it("auto-detects customQuery/customMutation/customAction wrappers", () => {
    const dir = createTempConvex({
      "functions.ts": `
import { customQuery, customMutation, customAction } from "convex-helpers/server/customFunctions";
import { query, mutation, action } from "./_generated/server";
export const authedQuery = customQuery(query, { /* auth middleware */ });
export const authedMutation = customMutation(mutation, { /* auth middleware */ });
export const authedAction = customAction(action, { /* auth middleware */ });
`,
      "incidents/incidents.ts": `
import { authedQuery, authedMutation } from "../functions";
export const get = authedQuery({ handler: async () => {} });
export const list = authedQuery({ handler: async () => [] });
export const create = authedMutation({ handler: async () => {} });
`,
    });
    const result = scanBackend(dir);
    const incidentFns = result.filter((f) => f.apiPath.startsWith("incidents."));
    expect(incidentFns).toHaveLength(3);
    expect(incidentFns.map((f) => f.apiPath).sort()).toEqual([
      "incidents.incidents.create",
      "incidents.incidents.get",
      "incidents.incidents.list",
    ]);
    expect(incidentFns.every((f) => !f.isInternal)).toBe(true);
  });

  it("auto-detects internal custom wrappers", () => {
    const dir = createTempConvex({
      "functions.ts": `
import { customQuery } from "convex-helpers/server/customFunctions";
import { internalQuery } from "./_generated/server";
export const internalAuthedQuery = customQuery(internalQuery, {});
`,
      "admin.ts": `
import { internalAuthedQuery } from "./functions";
export const getStats = internalAuthedQuery({ handler: async () => {} });
`,
    });
    const result = scanBackend(dir);
    const adminFns = result.filter((f) => f.apiPath.startsWith("admin."));
    expect(adminFns).toHaveLength(1);
    expect(adminFns[0].isInternal).toBe(true);
  });

  it("explicit config overrides auto-detected visibility", () => {
    const dir = createTempConvex({
      "functions.ts": `
import { customQuery } from "convex-helpers/server/customFunctions";
import { query } from "./_generated/server";
export const myQuery = customQuery(query, {});
`,
      "data.ts": `
import { myQuery } from "./functions";
export const list = myQuery({ handler: async () => [] });
`,
    });
    // Auto-detect would make it public, but config overrides to internal
    const result = scanBackend(dir, { myQuery: "internal" });
    expect(result.find((f) => f.apiPath === "data.list")?.isInternal).toBe(true);
  });

  it("does not shadow builtins when wrapper has same name", () => {
    const dir = createTempConvex({
      "functions.ts": `
import { customQuery } from "convex-helpers/server/customFunctions";
import { query as baseQuery } from "./_generated/server";
const query = customQuery(baseQuery, {});
export { query };
`,
      "data.ts": `
import { query } from "./_generated/server";
export const list = query({ handler: async () => [] });
`,
    });
    const result = scanBackend(dir);
    // Should still find the builtin query usage
    expect(result.find((f) => f.apiPath === "data.list")).toBeDefined();
    expect(result.find((f) => f.apiPath === "data.list")?.isInternal).toBe(false);
  });
});

describe("detectWrappers", () => {
  function createTempFiles(files: Record<string, string>): string[] {
    const dir = mkdtempSync(join(tmpdir(), "detect-test-"));
    const paths: string[] = [];
    for (const [path, content] of Object.entries(files)) {
      const full = join(dir, path);
      mkdirSync(join(full, ".."), { recursive: true });
      writeFileSync(full, content);
      paths.push(full);
    }
    return paths;
  }

  it("detects customQuery wrapping query as public", () => {
    const files = createTempFiles({
      "functions.ts": `export const authedQuery = customQuery(query, {});`,
    });
    expect(detectWrappers(files)).toEqual({ authedQuery: "public" });
  });

  it("detects customMutation wrapping internalMutation as internal", () => {
    const files = createTempFiles({
      "functions.ts": `export const internalAuthedMutation = customMutation(internalMutation, {});`,
    });
    expect(detectWrappers(files)).toEqual({ internalAuthedMutation: "internal" });
  });

  it("detects multiple wrappers in one file", () => {
    const files = createTempFiles({
      "functions.ts": `
export const authedQuery = customQuery(query, {});
export const authedMutation = customMutation(mutation, {});
export const authedAction = customAction(action, {});
`,
    });
    expect(detectWrappers(files)).toEqual({
      authedQuery: "public",
      authedMutation: "public",
      authedAction: "public",
    });
  });

  it("handles non-exported wrappers", () => {
    const files = createTempFiles({
      "functions.ts": `const myQuery = customQuery(query, {});`,
    });
    expect(detectWrappers(files)).toEqual({ myQuery: "public" });
  });

  it("returns empty for files with no custom wrappers", () => {
    const files = createTempFiles({
      "users.ts": `export const list = query({ handler: async () => [] });`,
    });
    expect(detectWrappers(files)).toEqual({});
  });
});
