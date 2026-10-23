/**
 * lib/mcp/tools/project-agent-tools.ts
 *
 * MCP tool definitions for web-AI handoff.
 * These tools do not execute the user request directly. They let external
 * agents discover projects and submit work to the Dify-backed Project Agent.
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";
import * as projectCap from "@/lib/capabilities/project";
import { createProjectAgentTask } from "@/lib/project-agent/task-store";
import { isProjectAgentDifyConfigured, runProjectAgentTask } from "@/lib/project-agent/dify-agent";
import { buildProjectAgentTaskUrl } from "@/lib/project-agent/url";

export const projectAgentToolSchemas: Tool[] = [
  {
    name: "list_projects",
    description: "List projects owned by the current user so a handoff can target the right project.",
    inputSchema: {
      type: "object" as const,
      properties: {
        task_session_id: { type: "string" },
      },
    },
  },
  {
    name: "delegate_to_web_ai",
    description:
      "Hand off a request to the Dify Project Agent. Use this for non-mindmap work that should use the selected project's instructions and knowledge.",
    inputSchema: {
      type: "object" as const,
      required: ["project_id", "prompt"],
      properties: {
        project_id: { type: "string", description: "Target project ID." },
        prompt: {
          type: "string",
          description: "The user's task for the Dify Project Agent.",
        },
        conversation_id: {
          type: "string",
          description: "Optional conversation/thread ID to keep the handoff tied to a chat.",
        },
        task_session_id: { type: "string" },
      },
    },
  },
];

export async function handleProjectAgentTool(
  toolName: string,
  args: Record<string, unknown>,
  ownerEmail: string,
): Promise<unknown> {
  switch (toolName) {
    case "list_projects": {
      const result = await projectCap.listProjects(ownerEmail);
      const projects = (result.data ?? []).filter((project) => !projectCap.isHiddenProject(project));
      return {
        projects: projects.map((project) => ({
          id: project.id,
          name: project.name,
          description: project.description,
          icon: project.icon,
          color: project.color,
          knowledgeFileCount: project.knowledgeFiles.length,
          createdAt: project.created_at,
          updatedAt: project.updated_at,
        })),
        total: projects.length,
      };
    }

    case "delegate_to_web_ai": {
      if (!isProjectAgentDifyConfigured()) return { error: "dify_project_agent_not_configured" };
      const projectId = String(args.project_id ?? "").trim();
      const prompt = String(args.prompt ?? "").trim();
      const conversationId = typeof args.conversation_id === "string" ? args.conversation_id : undefined;

      if (!projectId) return { error: "project_id_required" };
      if (!prompt) return { error: "prompt_required" };

      const project = await projectCap.getProject(projectId, ownerEmail);
      if (!project.ok) return { error: "project_not_found", project_id: projectId };

      const task = await createProjectAgentTask({
        projectId,
        ownerEmail,
        prompt,
        conversationId,
      });

      const finished = await runProjectAgentTask(task.id);
      return {
        task: finished,
        completed: finished.status === "done",
        task_url: buildProjectAgentTaskUrl(projectId, task.id),
      };
    }

    default:
      return { error: "unknown_tool", tool: toolName };
  }
}
