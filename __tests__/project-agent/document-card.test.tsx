// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectAgentDocumentCard, parseDocumentCard } from "@/components/features/projects/ProjectAgentDocumentCard";

afterEach(cleanup);

describe("document card", () => {
	it("reads an explicit title line, else the first heading", () => {
		expect(parseDocumentCard("title: Weekly minutes\n\n## Items\n- one")).toEqual({ title: "Weekly minutes", body: "## Items\n- one" });
		expect(parseDocumentCard("# Site memo\n\nText").title).toBe("Site memo");
		expect(parseDocumentCard("plain text").title).toBe("");
	});

	it("renders the markdown as a Writing card that expands and closes", () => {
		render(<ProjectAgentDocumentCard source={"title: Weekly minutes\n\n## Tasks\n\n| Owner | Due |\n|---|---|\n| A | Friday |"} />);
		expect(screen.getByRole("region", { name: "Writing" })).toBeTruthy();
		expect(screen.getByText("Tasks")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Expand" }));
		expect(screen.getByRole("dialog", { name: "Weekly minutes" })).toBeTruthy();
		fireEvent.keyDown(window, { key: "Escape" });
		expect(screen.queryByRole("dialog")).toBeNull();
	});
});
