#!/usr/bin/env node
import("../dist/cli.js").then((m) => m.main()).catch((err) => {
  console.error("Unexpected error:", err.message);
  process.exit(2);
});
