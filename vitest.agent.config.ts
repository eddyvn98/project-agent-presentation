import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  plugins: [react()],
  resolve: { alias: [
    { find: "@/lib/markdown/CodeBlock.client", replacement: local("./src/lib/markdown/CodeBlock.client.tsx") },
    { find: "@/lib/skills/skillsStore", replacement: local("./tests/agent-host/skills-store.ts") },
    { find: "@/lib/skills/ossClient", replacement: local("./tests/agent-host/skills-oss-client.ts") },
    { find: "@/lib/projects/api-access", replacement: local("./tests/agent-host/request-access.ts") },
    { find: "@/lib/capabilities/project-sharing", replacement: local("./tests/agent-host/project-sharing.ts") },
    { find: "@/app/api/aidt-access/_module-guard", replacement: local("./tests/agent-host/module-guard.ts") },
    { find: "@/stores/useAgentComposerStore", replacement: local("./tests/agent-host/composer-store.ts") },
    { find: "@/lib/vector-store", replacement: local("./tests/agent-host/vector-store.ts") },
    { find: "@/lib/upload-progress", replacement: local("./tests/agent-host/upload-progress.ts") },
    { find: "@/lib/capabilities/project", replacement: local("./tests/agent-host/project.ts") },
    { find: "@/services/mongodb/projectAgentTasks.repo", replacement: local("./tests/agent-host/project-agent-tasks-repo.ts") },
    { find: "@/services/mongodb/client", replacement: local("./tests/agent-host/mongo-client.ts") },
    { find: "@/lib/ai-model-catalog", replacement: local("./tests/agent-host/ai-model-catalog.ts") },
    { find: "@/app/workspace/utils/workspaceChatRequest", replacement: local("./tests/agent-host/workspace-chat-request.ts") },
    { find: "@/lib/capabilities/project-knowledge", replacement: local("./tests/agent-host/project-knowledge.ts") },
    { find: /^@\//, replacement: `${local("./")}` },
  ] },
  test: { environment: "jsdom", include: ["tests/agent/**/*.test.{ts,tsx}",
    "__tests__/project-agent/client.test.ts", "__tests__/project-agent/conversations.test.ts",
    "__tests__/project-agent/conversation-session.test.ts", "__tests__/project-agent/runtime-engines.test.ts",
    "__tests__/project-agent/task-error-notice.test.tsx",
    "__tests__/project-agent/task-pagination.test.ts", "__tests__/project-agent/wait-action.test.ts", "__tests__/project-agent/runtime-actions.test.ts"],
    setupFiles: ["./tests/setup.ts", "./tests/agent/setup.ts"],
  },
});
