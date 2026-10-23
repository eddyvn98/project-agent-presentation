// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TaskErrorNotice, friendlyTaskError } from "@/components/features/projects/ProjectAgentErrorNotice";

afterEach(cleanup);

describe("task error notice", () => {
	it("explains known failures in plain language and keeps the technical text", () => {
		expect(friendlyTaskError("The model kept replying without a valid action (no JSON object found)")).toMatch(/Try again/);
		expect(friendlyTaskError("Model step failed (502: <html>Bad Gateway)")).toMatch(/busy or unreachable/);
		expect(friendlyTaskError("status failed: terminated")).toMatch(/too long/);
		expect(friendlyTaskError("Some unknown problem")).toBeNull();
		render(<TaskErrorNotice error="Model step failed (502: Bad Gateway)" cancelled={false} />);
		expect(screen.getByRole("alert").textContent).toContain("busy or unreachable");
		expect(screen.getByText("Technical details")).toBeTruthy();
	});
	it("shows unknown errors and cancellations unchanged", () => {
		render(<TaskErrorNotice error="Some unknown problem" cancelled={false} />);
		expect(screen.getByRole("alert").textContent).toBe("Some unknown problem");
	});
});
