export interface ChartImageLegend { label: string; color: string }

/** Render the already-displayed chart, including its host-supplied title and legend. */
export async function chartImageBlob(svg: SVGSVGElement, title: string, legend: ChartImageLegend[]): Promise<Blob> {
  const box = svg.getBoundingClientRect();
  if (!(box.width > 0 && box.height > 0)) throw new Error("Chart is not visible");
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(Math.ceil(box.width)));
  clone.setAttribute("height", String(Math.ceil(box.height)));
  const source = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not render chart image"));
      image.src = source;
    });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable");
    const width = Math.max(280, Math.ceil(box.width));
    const textLines = (value: string, available: number) => {
      const lines: string[] = [];
      let line = "";
      for (const character of value) {
        if (line && context.measureText(line + character).width > available) { lines.push(line); line = ""; }
        line += character;
      }
      if (line) lines.push(line);
      return lines;
    };
    context.font = "600 14px system-ui, sans-serif";
    const titleLines = textLines(title, width - 24);
    const header = titleLines.length ? titleLines.length * 20 + 16 : 8;
    context.font = "12px system-ui, sans-serif";
    const legendLines = legend.map((item) => ({ ...item, lines: textLines(item.label, width - 44) }));
    const footer = legendLines.reduce((height, item) => height + Math.max(1, item.lines.length) * 18 + 4, 0) + 12;
    const height = header + box.height + footer;
    const scale = Math.min(2, 8192 / Math.max(width, height));
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    context.scale(scale, scale);
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.font = "600 14px system-ui, sans-serif";
    context.fillStyle = "#20242b";
    titleLines.forEach((line, index) => context.fillText(line, 12, 22 + index * 20));
    context.drawImage(image, 0, header, box.width, box.height);
    context.font = "12px system-ui, sans-serif";
    let top = header + box.height + 14;
    for (const item of legendLines) {
      context.fillStyle = item.color;
      context.fillRect(12, top - 9, 9, 9);
      context.fillStyle = "#20242b";
      item.lines.forEach((line, index) => context.fillText(line, 30, top + index * 18));
      top += Math.max(1, item.lines.length) * 18 + 4;
    }
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Could not export chart")), "image/png",
    ));
  } finally { URL.revokeObjectURL(source); }
}

export function downloadChartImage(blob: Blob, title: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  try {
    link.href = url;
    link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "chart"}.png`;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
