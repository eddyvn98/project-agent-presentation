// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectAgentFileVersions } from "@/components/features/projects/ProjectAgentFileVersions";
import { fileVersions } from "@/lib/project-agent/file-versions";
import type { PublicProjectAgentTask } from "@/lib/project-agent/public-task";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const task = (id: string) => ({ id, status: "done", createdAt: "2026-10-20T10:00:00Z", files: [{ id: `${id}-f`, name: "deck.pptx", mimeType: "x", size: 1 }] }) as unknown as PublicProjectAgentTask;

describe("file versions menu", () => {
	it("lists versions and puts an earlier one back in the workspace", async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
		vi.stubGlobal("fetch", fetchMock);
		const versions = fileVersions([task("a"), task("b")], "deck.pptx");
		render(<ProjectAgentFileVersions projectId="p" versions={versions} currentTaskId="b" fileHref={() => "#"} />);
		fireEvent.click(screen.getByRole("button", { name: /Version 2 of 2/ }));
		fireEvent.click(screen.getByRole("button", { name: "Continue from this" }));
		await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Version 1 is back"));
		expect(fetchMock.mock.calls[0][0]).toBe("/api/projects/p/agent/tasks/a/files/a-f/restore");
	});
	it("renders nothing for a single version", () => {
		const { container } = render(<ProjectAgentFileVersions projectId="p" versions={fileVersions([task("a")], "deck.pptx")} currentTaskId="a" fileHref={() => "#"} />);
		expect(container.textContent).toBe("");
	});
});
