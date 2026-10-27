import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import zlib from "node:zlib";
import { resolvePublicAddresses, type AddressLookup } from "./web-security";

export interface GuardedResponse { status: number; headers: Record<string, string>; body: Buffer; truncated: boolean }
export interface GuardedRequest {
	method?: string; headers?: Record<string, string>; body?: Buffer | string; signal?: AbortSignal; maxBytes?: number; timeoutMs?: number;
	lookup?: AddressLookup;
}

/**
 * One HTTP request (no redirect following) whose connection uses the addresses that were checked, so a hostname cannot
 * pass the public-address check and then resolve to a private address when the socket connects (DNS rebinding).
 */
export async function guardedRequest(rawUrl: string, options: GuardedRequest = {}): Promise<GuardedResponse> {
	const url = new URL(rawUrl);
	if (!/^https?:$/.test(url.protocol)) throw new Error("only http and https URLs are allowed");
	if (url.username || url.password) throw new Error("URLs containing credentials are not allowed");
	const addresses = await resolvePublicAddresses(url.hostname, options.lookup);
	const pinned: LookupFunction = (_hostname, lookupOptions, callback) => {
		if (lookupOptions?.all) (callback as (error: null, list: typeof addresses) => void)(null, addresses);
		else callback(null, addresses[0].address, addresses[0].family);
	};
	const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
	const transport = url.protocol === "https:" ? https : http;
	return new Promise<GuardedResponse>((resolve, reject) => {
		const request = transport.request(url, {
			method: options.method ?? "GET", lookup: pinned, signal: options.signal, timeout: options.timeoutMs ?? 30_000,
			headers: { "accept-encoding": "gzip, deflate, br", ...options.headers },
		}, (response) => {
			const encoding = String(response.headers["content-encoding"] ?? "").toLowerCase();
			const stream = encoding === "gzip" ? response.pipe(zlib.createGunzip())
				: encoding === "deflate" ? response.pipe(zlib.createInflate())
					: encoding === "br" ? response.pipe(zlib.createBrotliDecompress()) : response;
			const chunks: Buffer[] = [];
			let size = 0;
			let truncated = false;
			const headers: Record<string, string> = {};
			for (const [name, value] of Object.entries(response.headers)) if (value !== undefined) headers[name] = Array.isArray(value) ? value.join(", ") : value;
			if (encoding) { delete headers["content-encoding"]; delete headers["content-length"]; }
			const finish = () => resolve({ status: response.statusCode ?? 0, headers, body: Buffer.concat(chunks), truncated });
			stream.on("data", (chunk: Buffer) => {
				if (truncated) return;
				size += chunk.length;
				if (size > maxBytes) { chunks.push(chunk.subarray(0, chunk.length - (size - maxBytes))); truncated = true; response.destroy(); finish(); return; }
				chunks.push(chunk);
			});
			stream.on("end", finish);
			stream.on("error", (error) => { if (!truncated) reject(error); });
		});
		request.on("timeout", () => request.destroy(new Error("request timed out")));
		request.on("error", reject);
		request.end(options.body);
	});
}
