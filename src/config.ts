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
