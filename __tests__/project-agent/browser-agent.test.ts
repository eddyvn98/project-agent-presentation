import { describe, expect, it } from "vitest";
import { parseRuntimeAction } from "../../lib/project-agent/runtime/actions";
import { assertPublicHttpUrl } from "../../lib/project-agent/runtime/web-security";
import { assertPublicWebSocketUrl, bindAbort, isCaptchaPage, isSensitiveField, requiresUserConfirmation, resolveSafeRedirect } from "../../lib/project-agent/runtime/browser-agent/safety";

describe("browser action parsing", () => {
	it("parses the browser operation vocabulary and rejects missing fields", () => {
		expect(parseRuntimeAction('{"action":"browser","op":"open","url":"https://example.com"}')).toMatchObject({ action: "browser", op: "open" });
		expect(parseRuntimeAction('{"action":"browser","op":"type","ref":"e2"}')).toMatchObject({ error: "browser type needs text" });
	});
});

describe("browser safety guards", () => {
	it("rejects private redirect targets, private websocket targets and non-web protocols", async () => {
		await expect(resolveSafeRedirect("https://public.example/path", "http://127.0.0.1/secret")).rejects.toThrow(/private or local/);
		await expect(assertPublicWebSocketUrl("ws://10.0.0.4/socket")).rejects.toThrow(/private or local/);
		await expect(assertPublicHttpUrl("data:text/html,hello")).rejects.toThrow(/only http and https/);
	});

	it("blocks sensitive fields, unapproved irreversible clicks, and captcha pages", () => {
		expect(isSensitiveField('textbox "Password"')).toBe(true);
		expect(requiresUserConfirmation('button "Order now"', "Find the cheapest book", "books.toscrape.com")).toBe(true);
		expect(requiresUserConfirmation('button "Order now"', "Order a book on books.toscrape.com", "books.toscrape.com")).toBe(false);
		expect(isCaptchaPage("Please verify you are human to continue")).toBe(true);
	});

	it("closes an active session when the task aborts", () => {
		const controller = new AbortController();
		let closed = false;
		bindAbort(controller.signal, () => { closed = true; });
		controller.abort();
		expect(closed).toBe(true);
	});
});
