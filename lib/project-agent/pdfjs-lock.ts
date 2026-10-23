/**
 * The app's pdfjs-dist 4 (visual review) and pdf-parse's bundled pdfjs 5 (large source reader) both leave their worker on
 * `globalThis.pdfjsWorker`, and either one picks up whatever is there. Run each use of pdfjs one at a time and start it from a
 * clean slate, otherwise a render that overlaps a PDF read fails with "The API version … does not match the Worker version …".
 * The queue lives on `globalThis` because Next can bundle this module separately per route, and the worker it guards is global.
 */
const globals = globalThis as { pdfjsWorker?: unknown; __pdfjsLockTail?: Promise<unknown> };

export function withPdfjs<T>(run: () => Promise<T>): Promise<T> {
	const next = (globals.__pdfjsLockTail ?? Promise.resolve()).then(() => {
		delete globals.pdfjsWorker;
		return run();
	});
	globals.__pdfjsLockTail = next.catch(() => undefined);
	return next;
}
