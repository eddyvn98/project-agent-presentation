// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectAgentFilePreview } from "@/components/features/projects/ProjectAgentFilePreview";
import type { ProjectAgentTaskFile } from "@/lib/project-agent/types";

vi.mock("@/components/features/projects/ProjectAgentDocumentViewer", () => ({
	ProjectAgentDocumentViewer: ({ kind }: { kind: string }) => <div data-testid="document-viewer">{kind}</div>,
}));
vi.mock("@/components/features/projects/ProjectAgentXlsxPreview", () => ({
	ProjectAgentXlsxPreview: () => <div data-testid="xlsx-viewer">Spreadsheet</div>,
}));
vi.mock("@/components/features/chat/file-preview-data-renderers", () => ({
	CsvRenderer: () => <div data-testid="csv-renderer">CSV data</div>,
	TextRenderer: ({ ext }: { ext: string }) => <div data-testid="text-renderer">{ext} data</div>,
}));
vi.mock("@/components/features/chat/file-preview-media-renderers", () => ({
	ImageRenderer: () => <div data-testid="image-renderer">Image</div>,
}));

const file = (name: string): ProjectAgentTaskFile => ({
	id: name,
	name,
	mimeType: "application/octet-stream",
	size: 12,
});

afterEach(cleanup);

describe("Project Agent file preview formats", () => {
	it.each(["pdf", "docx", "pptx"])("opens %s in the document viewer", (ext) => {
		render(<ProjectAgentFilePreview projectId="p" taskId="t" file={file(`sample.${ext}`)} />);
		fireEvent.click(screen.getByRole("button", { name: `Preview sample.${ext}` }));
		expect(screen.getByRole("dialog", { name: `Preview sample.${ext}` })).toBeTruthy();
		expect(screen.getByTestId("document-viewer").textContent).toBe(["pptx"].includes(ext) ? "slides" : "pages");
	});

	it.each(["xlsx", "xls", "svg"]) ("opens %s in the rendered-file viewer", (ext) => {
		render(<ProjectAgentFilePreview projectId="p" taskId="t" file={file(`sample.${ext}`)} />);
		fireEvent.click(screen.getByRole("button", { name: `Preview sample.${ext}` }));
		expect(screen.getByRole("dialog", { name: `Preview: sample.${ext}` })).toBeTruthy();
		if (ext === "xlsx") expect(screen.getByTestId("xlsx-viewer")).toBeTruthy();
		else expect(screen.getByAltText(`Rendered pages of sample.${ext}`)).toBeTruthy();
	});

	it.each(["csv", "txt", "md", "json", "jsonl", "tsv", "xml", "yaml", "yml", "log", "png", "jpg", "gif"]) ("opens %s in the data or media viewer", (ext) => {
		render(<ProjectAgentFilePreview projectId="p" taskId="t" file={file(`sample.${ext}`)} />);
		fireEvent.click(screen.getByRole("button", { name: `Preview sample.${ext}` }));
		if (ext === "csv") expect(screen.getByTestId("csv-renderer")).toBeTruthy();
		else if (["txt", "md", "json", "jsonl", "tsv", "xml", "yaml", "yml", "log"].includes(ext)) expect(screen.getByTestId("text-renderer").textContent).toBe(`${ext} data`);
		else expect(screen.getByTestId("image-renderer")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Discuss this file in chat" })).toBeTruthy();
	});

	it("previews HTML with existing query parameters and supports zoom, full width, and close", () => {
		render(<ProjectAgentFilePreview projectId="p" taskId="t" file={file("report.html")} />);
		fireEvent.click(screen.getByRole("button", { name: "Preview report.html" }));
		expect(screen.getByTitle("Rendered preview of report.html").getAttribute("src")).toContain("preview=1");
		fireEvent.click(screen.getByRole("button", { name: "Zoom" }));
		fireEvent.click(screen.getByRole("menuitemradio", { name: "200%" }));
		expect(screen.getByRole("button", { name: "Zoom" }).textContent).toContain("200%");
		fireEvent.click(screen.getByRole("button", { name: "Full width" }));
		expect(screen.getByRole("button", { name: "Exit full width" })).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
		expect(screen.queryByRole("dialog")).toBeNull();
	});
});
