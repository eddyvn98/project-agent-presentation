// Synthetic end-to-end answer fixture: never uses real customer data or external credentials.
const fence = (language: string, body: string) => "```" + language + "\n" + body + "\n```";
const chart = (kind: string, categories: string[], series: Array<{name: string; values: number[]}>) =>
  fence("agent-ui", JSON.stringify({ type: "chart", kind, title: "Synthetic " + kind + " chart",
    caption: "QA data only; toggle Table for exact values.", categories, series }));
export const responseShowcase = [
  "## Response renderer QA",
  "Mixed **bold**, *italic*, `inline code`, a checklist and a five-column table should stay readable.",
  "- [x] Reviewed synthetic evidence", "- [ ] Awaiting independent validation",
  "> A synthetic quotation for layout inspection.",
  "| Period | Revenue | Cost | Margin | Notes |",
  "|:--|--:|--:|--:|:--|",
  "| January | 1,250 | 900 | 350 | Verified fixture |",
  "| February | 1,560 | 920 | 640 | Synthetic only |",
  fence("typescript", "const values = [1250, 1560];\nconsole.log(values.reduce((a, b) => a + b, 0));"),
  "## Chart renderer QA",
  chart("line", ["January", "February", "March", "April", "May", "June", "July", "August"],
    [{ name: "Revenue", values: [1250, 1560, 1800, 1780, 2040, 2240, 2450, 2680] },
     { name: "Cost", values: [900, 920, 1000, 1120, 1180, 1320, 1400, 1450] }]),
  chart("pie", ["North", "Central", "South"],
    [{ name: "Share", values: [42, 28, 30] }]),
  "## Cards and decisions QA",
  fence("agent-ui", JSON.stringify({ type: "kpis",
    items: [{ label: "Synthetic users", value: "1,250", tone: "info" },
      { label: "Synthetic change", value: "+12%", tone: "success" }] })),
  fence("agent-ui", JSON.stringify({ type: "callout", tone: "warning",
    title: "Demo only", text: "This interface contains no real user data." })),
].join("\n\n");
