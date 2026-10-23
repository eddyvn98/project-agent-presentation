/**
 * Cheap gate for the math renderer. False positives cost an optional download;
 * false negatives would leave real math unformatted, so favour recognition.
 * Fenced and inline code should never trigger the KaTeX download.
 */
export function containsMathMarkdown(markdown: string): boolean {
  let fence: { character: string; length: number } | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = { character: marker[0], length: marker.length };
      else if (marker[0] === fence.character && marker.length >= fence.length &&
        /^\s{0,3}(`{3,}|~{3,})\s*$/.test(line)) fence = null;
      continue;
    }
    if (fence) continue;
    let inlineTicks = 0;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === "`") {
        let count = 1;
        while (line[i + count] === "`") count++;
        if (!inlineTicks) inlineTicks = count;
        else if (inlineTicks === count) inlineTicks = 0;
        i += count - 1;
        continue;
      }
      if (inlineTicks || line[i] !== "$") continue;
      let slashes = 0;
      for (let k = i - 1; k >= 0 && line[k] === "\\"; k--) slashes++;
      if (slashes % 2) continue;
      if (line[i + 1] === "$") return true;
      if (!line[i + 1] || /\s/.test(line[i + 1])) continue;
      for (let j = i + 1; j < line.length; j++) {
        if (line[j] === "`") break;
        if (line[j] !== "$" || /\s/.test(line[j - 1])) continue;
        let closingSlashes = 0;
        for (let k = j - 1; k >= 0 && line[k] === "\\"; k--) closingSlashes++;
        if (closingSlashes % 2 === 0) return true;
      }
    }
  }
  return false;
}
