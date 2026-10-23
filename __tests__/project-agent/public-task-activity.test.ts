import { describe, expect, it } from "vitest";
import { taskActivity } from "../../lib/project-agent/public-task";

describe("browser activity rendering data", () => {
	it("labels browser operations and exposes the screenshot render thumbnail id", () => {
		const activity = taskActivity([
			"2026-10-20T01:00:00.000Z using tool browser_open #browser-1 :: https://quotes.toscrape.com/js/",
			"2026-10-20T01:00:01.000Z using tool browser_screenshot #render-2 :: page screenshot",
		]);
		expect(activity.map((step) => step.label)).toEqual(["Opening a webpage", "Taking a browser screenshot"]);
		expect(activity[1].images).toEqual(["render-2"]);
	});
});
