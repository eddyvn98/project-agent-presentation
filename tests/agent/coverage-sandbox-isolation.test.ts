import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
const m = vi.hoisted(() => ({
  docker: vi.fn(), quota: vi.fn(), hostPath: vi.fn(),
  closeBrowsers: vi.fn(),
}));
vi.mock("node:child_process", () => ({ execFile: m.docker }));
vi.mock("../../lib/project-agent/runtime/workspace-quota", () => ({
  quotaMessage: m.quota,
}));
vi.mock("../../lib/project-agent/runtime/host-path", () => ({
  hostPath: m.hostPath,
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/session", () => ({
  closeBrowserSessionsForChat: m.closeBrowsers,
}));
import { containerName, execInSandbox, resolveWorkspacePath,
  stopSandbox, workspaceDir } from "../../lib/project-agent/runtime/sandbox";

let chat: string;
beforeEach(() => {
  chat = "qa-sandbox-" + randomUUID();
  vi.clearAllMocks();
  vi.stubEnv("PROJECT_AGENT_SANDBOX_MAX_CONTAINERS", "24");
  m.hostPath.mockImplementation((p: string) => p);
  m.quota.mockResolvedValue(null);
  m.closeBrowsers.mockResolvedValue(undefined);
  m.docker.mockImplementation((_command: string, args: string[],
    _options: unknown, callback: (err: unknown, stdout: string, stderr: string) => void) => {
    const stdout = args[0] === "inspect" ? "true" :
      args[0] === "ps" ? "" : args[0] === "exec" ? "synthetic stdout" : "ok";
    callback(null, stdout, "");
  });
});
afterEach(async () => {
  await stopSandbox(chat);
  await fs.rm(workspaceDir(chat), { recursive: true, force: true });
  vi.unstubAllEnvs();
});
describe("Sandbox workspace and Docker execution boundaries", () => {
  it("isolates host workspace names by chat and resolves only contained paths", () => {
    const other = "different-qa-chat";
    expect(containerName(chat)).toMatch(/^pa-sbx-[a-f0-9]{12}$/);
    expect(containerName(chat)).not.toBe(containerName(other));
    expect(workspaceDir(chat)).not.toBe(workspaceDir(other));
    expect(resolveWorkspacePath(chat, "inputs/source.txt"))
      .toBe(path.join(workspaceDir(chat), "inputs/source.txt"));
    expect(resolveWorkspacePath(chat, "/work/outputs/result.pdf"))
      .toBe(path.join(workspaceDir(chat), "outputs/result.pdf"));
    for (const unsafe of ["../escape", "outputs/../../escape",
      "/work/../../../escape", "inputs/../../../../etc/passwd"]) {
      expect(() => resolveWorkspacePath(chat, unsafe)).toThrow(/outside the sandbox/);
    }
  });
  it("runs a bounded synthetic Docker command with a reused workspace", async () => {
    const result = await execInSandbox(chat, "printf hello", 1);
    expect(result).toMatchObject({
      output: "synthetic stdout", exitCode: 0, timedOut: false,
    });
    expect(m.docker.mock.calls.some(c => c[1][0] === "inspect")).toBe(true);
    const execCall = m.docker.mock.calls.find(c => c[1][0] === "exec");
    expect(execCall).toBeTruthy();
    expect(execCall[1]).toContain("5");
    expect(execCall[1]).toContain("bash");
    expect(await fs.stat(path.join(workspaceDir(chat), "inputs")))
      .toBeTruthy();
  });
  it("refuses quota-exceeded shell commands before running docker exec", async () => {
    m.quota.mockResolvedValueOnce("Workspace over quota; delete temp files");
    const result = await execInSandbox(chat, "cat large.bin");
    expect(result).toMatchObject({ exitCode: 1,
      timedOut: false, output: "Workspace over quota; delete temp files" });
    expect(m.docker.mock.calls.some(c => c[1][0] === "exec")).toBe(false);
  });
  it("enforces read-only workspace mounts in a disposable container", async () => {
    await execInSandbox(chat, "cat /work/inputs/answer.txt", 7, true);
    const runCall = m.docker.mock.calls.find(c => c[1][0] === "run");
    expect(runCall).toBeTruthy();
    expect(runCall[1]).toContain("--tmpfs");
    expect(runCall[1].some((a: string) => a.endsWith(":/work:ro"))).toBe(true);
    expect(runCall[1]).toContain("--cap-drop");
    expect(m.docker.mock.calls.some(c => c[1][0] === "exec")).toBe(false);
  });
  it("reports Docker timeouts and keeps a complete capped log separately", async () => {
    m.docker.mockImplementation((_command: string, args: string[],
      _options: unknown, callback: (err: unknown, stdout: string, stderr: string) => void) => {
      if (args[0] === "exec") return callback({ code: 124 }, "", "synthetic timeout");
      callback(null, args[0] === "inspect" ? "true" : "", "");
    });
    const result = await execInSandbox(chat, "sleep 700", 9999);
    expect(result).toMatchObject({ exitCode: 124, timedOut: true });
    const call = m.docker.mock.calls.find(c => c[1][0] === "exec");
    expect(call[1]).toContain("600");
  });
  it("closes task-scoped browser sessions before removing sandbox", async () => {
    await execInSandbox(chat, "echo ready");
    await stopSandbox(chat);
    expect(m.closeBrowsers).toHaveBeenCalledWith(chat);
    expect(m.docker.mock.calls.some(c => c[1][0] === "rm")).toBe(true);
  });
});
