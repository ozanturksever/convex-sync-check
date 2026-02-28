import type { CheckResult } from "../types.js";

export function formatJson(result: CheckResult): string {
  return JSON.stringify(result, null, 2);
}
