/** The host owns real XHR uploads. Tests must explicitly mock this boundary. */
export async function xhrUpload(..._args: unknown[]): Promise<never> { throw new Error("Host upload adapter unavailable in neutral tests"); }
