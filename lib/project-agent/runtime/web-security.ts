import dns from "node:dns/promises";
import net from "node:net";

/**
 * Every range that is not a plain public unicast address, including IPv6 forms that embed or tunnel to IPv4. Two lists:
 * a BlockList maps IPv4 addresses onto its IPv6 rules, so "::/96" in a shared list would match every IPv4 address.
 */
const blocked4 = new net.BlockList();
const blocked6 = new net.BlockList();
for (const [prefix, bits] of [
	["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
	["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
	["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked4.addSubnet(prefix, bits, "ipv4");
for (const [prefix, bits] of [
	["::", 96], ["::ffff:0:0", 96], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64], ["2001::", 32], ["2001:db8::", 32],
	["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as const) blocked6.addSubnet(prefix, bits, "ipv6");

export function isPrivateAddress(address: string): boolean {
	const family = net.isIP(address);
	if (family === 4) return blocked4.check(address, "ipv4");
	if (family === 6) return blocked6.check(address, "ipv6");
	return true;
}

export type AddressLookup = (hostname: string) => Promise<Array<{ address: string; family?: number }>>;
const systemLookup: AddressLookup = (hostname) => dns.lookup(hostname, { all: true });

/** Resolves a hostname and refuses it when any address is private or local. */
export async function resolvePublicAddresses(hostname: string, lookup: AddressLookup = systemLookup): Promise<Array<{ address: string; family: number }>> {
	const bare = hostname.replace(/^\[|\]$/g, "");
	const addresses = net.isIP(bare) ? [{ address: bare }] : await lookup(bare);
	if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error("private or local addresses are refused");
	return addresses.map(({ address }) => ({ address, family: net.isIP(address) }));
}

/** Refuses non-web protocols and any hostname that resolves to a private or local address. */
export async function assertPublicHttpUrl(rawUrl: string, lookup: AddressLookup = systemLookup): Promise<URL> {
	const url = new URL(rawUrl);
	if (!/^https?:$/.test(url.protocol)) throw new Error("only http and https URLs are allowed");
	if (url.username || url.password) throw new Error("URLs containing credentials are not allowed");
	await resolvePublicAddresses(url.hostname, lookup);
	return url;
}
