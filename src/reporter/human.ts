import type { CheckResult } from "../types.js";

export function formatHuman(result: CheckResult): string {
  const lines: string[] = [];

  lines.push("");
  lines.push("═══ Convex Function Sync Check ═══");
  lines.push("");
  lines.push(`  Project:           ${result.project}`);
  lines.push(`  Convex dir:        ${result.convexDir}`);
  lines.push(`  Frontend dir:      ${result.frontendDirs.join(", ")}`);
  lines.push(
    `  Defined functions: ${result.stats.definedFunctions} (${result.stats.publicFunctions} public, ${result.stats.internalFunctions} internal)`
  );
  lines.push(`  Frontend refs:     ${result.stats.frontendRefs} unique api paths`);
  lines.push(`  Backend modules:   ${result.stats.backendModules}`);
  lines.push("");

  const missingDefs = result.errors.filter(
    (e) => e.type === "MISSING_DEFINITION"
  );
  const internalLeaks = result.errors.filter(
    (e) => e.type === "INTERNAL_CALLED_FROM_FRONTEND"
  );
  const notDeployed = result.errors.filter(
    (e) => e.type === "NOT_DEPLOYED"
  );

  if (missingDefs.length > 0) {
    lines.push(
      `✗ ${missingDefs.length} function(s) referenced but NOT defined:`
    );
    lines.push("");
    for (const err of missingDefs) {
      lines.push(`  ✗ api.${err.apiPath}`);
      for (const loc of err.locations) {
        lines.push(`    → ${loc.file}:${loc.line}`);
      }
      lines.push("");
    }
  }

  if (internalLeaks.length > 0) {
    lines.push(
      `✗ ${internalLeaks.length} internal function(s) called from frontend:`
    );
    lines.push("");
    for (const err of internalLeaks) {
      lines.push(`  ✗ api.${err.apiPath} (internal — should not be called from frontend)`);
      for (const loc of err.locations) {
        lines.push(`    → ${loc.file}:${loc.line}`);
      }
      lines.push("");
    }
  }

  if (notDeployed.length > 0) {
    lines.push(
      `✗ ${notDeployed.length} function(s) defined but NOT deployed:`
    );
    lines.push("");
    for (const err of notDeployed) {
      lines.push(`  ✗ api.${err.apiPath}`);
      for (const loc of err.locations) {
        lines.push(`    → ${loc.file}:${loc.line}`);
      }
      lines.push("");
    }
  }

  if (result.warnings.length > 0) {
    lines.push(
      `⚠ ${result.warnings.length} public function(s) defined but not referenced from frontend:`
    );
    lines.push("");
    for (const warn of result.warnings) {
      lines.push(`  ○ api.${warn.apiPath} (${warn.definition.type})`);
      lines.push(`    ${warn.definition.file}:${warn.definition.line}`);
    }
    lines.push("");
  }

  if (result.passed) {
    lines.push("PASS — All Convex function references are in sync.");
  } else {
    lines.push("FAIL — Convex function sync issues found.");
  }

  lines.push("");
  return lines.join("\n");
}
