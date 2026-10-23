import path from "node:path";

/** The app runs in a container but the Docker daemon resolves `-v` paths on the host, so files under <cwd>/data must be named by the host directory that is mounted there. */
export function hostPath(file: string): string {
	const host = process.env.SANDBOX_HOST_DATA_DIR?.trim();
	if (!host) return file;
	const relative = path.relative(path.join(process.cwd(), "data"), file);
	return relative.startsWith("..") || path.isAbsolute(relative) ? file : path.join(host, relative);
}
