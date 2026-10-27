import { describe, expect, it } from "vitest";
import { assertPublicHttpUrl, isPrivateAddress, resolvePublicAddresses,
  type AddressLookup } from "../../lib/project-agent/runtime/web-security";
import { guardedRequest } from "../../lib/project-agent/runtime/guarded-fetch";
import { assertPublicWebSocketUrl, resolveSafeRedirect }
  from "../../lib/project-agent/runtime/browser-agent/safety";

const publicLookup: AddressLookup = async () => [{ address: "8.8.8.8", family: 4 }];
const mixedLookup: AddressLookup = async () => [
  { address: "8.8.8.8", family: 4 }, { address: "127.0.0.1", family: 4 }];
describe("L17 browser network SSRF and redirect safety", () => {
  it("blocks private IPv4, IPv6, multicast, metadata and special-use addresses", () => {
    for (const value of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.0.2",
      "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1",
      "255.255.255.255", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1",
      "2002:c0a8:101::1"]) expect(isPrivateAddress(value)).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false);
  });
  it("rejects DNS responses containing even one local address", async () => {
    await expect(resolvePublicAddresses("attacker.example", mixedLookup))
      .rejects.toThrow(/private or local/);
    await expect(assertPublicHttpUrl("https://attacker.example", mixedLookup))
      .rejects.toThrow(/private or local/);
    await expect(guardedRequest("https://attacker.example", { lookup: mixedLookup }))
      .rejects.toThrow(/private or local/);
    expect((await resolvePublicAddresses("safe.example", publicLookup))[0].address).toBe("8.8.8.8");
  });
  it("blocks credentialled URLs, alternate localhost spellings and unsafe protocols", async () => {
    for (const url of ["file:///etc/passwd", "ftp://example.com/x", "http://127.1/",
      "http://0x7f000001/", "http://2130706433/", "http://[::ffff:7f00:1]/",
      "http://user:pass@example.com"]) {
      await expect(assertPublicHttpUrl(url, publicLookup)).rejects.toThrow();
    }
    await expect(assertPublicHttpUrl("https://safe.example/", publicLookup))
      .resolves.toBeInstanceOf(URL);
  });
  it("does not let redirects or websocket upgrades bypass local-address guard", async () => {
    for (const target of ["http://127.0.0.1:3005/private", "http://169.254.169.254/latest/meta-data",
      "//localhost/admin", "http://[::1]/", "file:///private/config"]) {
      await expect(resolveSafeRedirect("https://example.com/start", target)).rejects.toThrow();
    }
    for (const raw of ["ws://127.0.0.1:9000", "wss://[::1]/", "ftp://example.org"])
      await expect(assertPublicWebSocketUrl(raw)).rejects.toThrow();
  });
});
