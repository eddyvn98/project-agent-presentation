import { describe, expect, it } from "vitest";
import { guardedRequest } from "../../lib/project-agent/runtime/guarded-fetch";
import { assertPublicHttpUrl, isPrivateAddress } from "../../lib/project-agent/runtime/web-security";

describe("browser request URL guard", () => {
	it("allows public HTTP addresses after DNS resolution", async () => {
		const url = await assertPublicHttpUrl("https://public.example/path", async () => [{ address: "93.184.216.34" }]);
		expect(url.href).toBe("https://public.example/path");
	});

	it("refuses non-web protocols, literal private IPs, and DNS names resolving locally", async () => {
		await expect(assertPublicHttpUrl("file:///etc/passwd")).rejects.toThrow("only http and https");
		await expect(assertPublicHttpUrl("http://127.0.0.1")).rejects.toThrow("private or local");
		await expect(assertPublicHttpUrl("http://127.1")).rejects.toThrow("private or local");
		await expect(assertPublicHttpUrl("http://[::ffff:7f00:1]/")).rejects.toThrow("private or local");
		await expect(assertPublicHttpUrl("http://mixed.example", async () => [
			{ address: "93.184.216.34" }, { address: "192.168.1.8" },
		])).rejects.toThrow("private or local");
	});

	it("treats tunnelled, embedded, reserved and multicast ranges as private", () => {
		for (const address of [
			"0.0.0.0", "10.1.2.3", "100.64.0.1", "169.254.169.254", "172.31.0.1", "192.0.0.8", "198.18.0.1", "224.0.0.1",
			"239.255.255.250", "255.255.255.255", "::", "::1", "::ffff:10.0.0.1", "64:ff9b::7f00:1", "2002:7f00:1::", "2001:0:4136::",
			"fc00::1", "fd12::1", "fe80::1", "febf::1", "fec0::1", "ff02::1", "not-an-ip",
		]) expect(isPrivateAddress(address), address).toBe(true);
		for (const address of ["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700:4700::1111"]) expect(isPrivateAddress(address), address).toBe(false);
	});
});

describe("guarded request", () => {
	it("refuses names that resolve to private addresses before connecting", async () => {
		await expect(guardedRequest("http://rebind.example/", { lookup: async () => [{ address: "127.0.0.1" }] })).rejects.toThrow("private or local");
	});
});
