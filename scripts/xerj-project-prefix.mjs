#!/usr/bin/env node
/** Print the scoped XERJ autoindex prefix for one Project. No network or indexing is performed. */
import { createHash } from "node:crypto";

const projectId = process.argv[2]?.trim() ?? "";
const salt = process.env.PROJECT_AGENT_XERJ_INDEX_SALT ?? "";
if (!projectId || salt.length < 16) {
  process.stderr.write("Usage: PROJECT_AGENT_XERJ_INDEX_SALT=<stable-secret> node scripts/xerj-project-prefix.mjs <project-id>\n");
  process.exitCode = 2;
} else {
  process.stdout.write("pa-" + createHash("sha256").update(salt).update("\0").update(projectId)
    .digest("hex").slice(0, 32) + "\n");
}
