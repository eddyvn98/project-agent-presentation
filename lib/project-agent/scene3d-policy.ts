/** Only the authenticated Project-file viewer route may supply executable HTML. */
export function safeProject3DViewerUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 400 ||
      /[%\\?#\u0000-\u0020\u007f]/.test(value) || value.includes("..") ||
      value.includes("//"))
    return null;
  return /^\/api\/projects\/[a-zA-Z0-9_-]{1,128}\/(?:agent\/)?(?:files|renders)\/[a-zA-Z0-9_.-]{1,128}\.html$/.test(value)
    ? value : null;
}
