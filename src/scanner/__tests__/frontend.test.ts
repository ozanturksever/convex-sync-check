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
