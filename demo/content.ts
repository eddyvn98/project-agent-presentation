// All examples, labels and sources in this fixture are synthetic.
export const explorer = {
  type: "explorer", title: "Eight states in a fictional cycle", intro: "A synthetic interaction test; this is not a scientific model.",
  steps: Array.from({ length: 8 }, (_, index) => ({
    label: `State ${index + 1}`, title: `Position ${index + 1}`, text: `The marker moves through eight demonstration positions. This is state ${index + 1}; the slider, selector and buttons show the same state.`,
    scene: { description: `Synthetic scene ${index + 1} with labeled marker`, elements: [
      { type: "circle", x: 15 + index * 10, y: 25, r: 6, fill: "blue", label: "Moving marker" },
      { type: "text", x: 50, y: 45, text: `Position ${index + 1} — synthetic`, size: 3, fill: "black", anchor: "middle" },
    ] },
  })),
};
export const markdown = String.raw`A clear explanation begins with its main idea. The examples below test presentation with synthetic content, so the answer remains understandable even if a visual cannot load.

## One idea, one illustration

This small illustration belongs beside the sentence it supports. Its caption supplies context, while the source stays concise.

![A synthetic blue marker](/demo/marker.svg)

## A reference figure

A larger figure can show more detail without filling the entire chat. Tap it to enlarge, zoom, and scroll.

![Synthetic reference grid](/demo/reference.svg)

## Readable mathematics

Inline math such as $a^2+b^2=c^2$ stays in the sentence. A display equation gets its own space:

$$
S_n = a\frac{1-r^n}{1-r}
$$

Invalid notation falls back visibly: $\notARealCommand{x}$. A literal price is \$20.

## Follow the sequence

Eight synthetic states move a marker from left to right. The selected state explains its position in words; use the selector to jump directly to any state.

` + "```agent-ui\n" + JSON.stringify(explorer) + "\n```\n" + String.raw`
## Text diagrams keep their columns

The next synthetic diagram is intentionally wider than a phone. Scroll sideways; its box edges must stay aligned.

` + "```text\nASCII diagram QA - long rows must stay aligned even on narrow mobile screens.\n┌──────────────────────┐          ┌─────────────────────────────────────────────────────────────────────────┐\n│ START                │ ───────▶ │ Read input and preserve each column instead of wrapping the long label. │\n└──────────────────────┘          └─────────────────────────────────────────────────────────────────────────┘\n```\n" + String.raw`
## A compact diagram

This fictional sequence has a start, a choice and two outcomes. Scroll or enlarge it to inspect labels.

` + "```mermaid\nflowchart TD\n A[Read the example] --> B{Choose a path}\n B --> C[Inspect the figure]\n B --> D[Read the explanation]\n```\n" + String.raw`
## Sources and graceful fallback

This [synthetic source](https://example.com/reference) demonstrates a keyboard-accessible citation; it provides no evidence for real scientific claims.

The explanation remains visible when optional visual data is malformed:

` + '```agent-ui\n{"type":"chart","categories":["A","B"],"series":[{"name":"Demo","values":[1]}]}\n```';
