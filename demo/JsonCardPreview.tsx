/** A deliberately small trusted host adapter: JSON fields become escaped React text, never code. */
export function JsonCardPreview({ code }: { code: string }) {
  const value: unknown = JSON.parse(code);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a JSON object");
  const record = value as Record<string, unknown>;
  if (typeof record.title !== "string" || !Array.isArray(record.items) || !record.items.every((item) => typeof item === "string")) {
    throw new Error("Expected a title and a list of text items");
  }
  return <section className="demo-preview-card" aria-label="Host-rendered JSON card">
    {typeof record.status === "string" && <span>{record.status}</span>}
    <h4>{record.title}</h4>
    <ul>{record.items.map((item, index) => <li key={index}>{item}</li>)}</ul>
    <p>This host adapter displays JSON data. It does not execute snippets.</p>
  </section>;
}
