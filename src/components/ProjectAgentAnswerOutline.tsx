"use client";

import type { AnswerHeading } from "@/lib/project-agent/answer-outline";

export function ProjectAgentAnswerOutline({ headings }: { headings: AnswerHeading[] }) {
  if (headings.length < 3) return null;
  return <details className="agent-answer-outline not-prose" data-agent-control>
    <summary>On this page <span>{headings.length} sections</span></summary>
    <nav aria-label="Answer sections">
      {headings.map((heading) => <a key={heading.id} href={`#${heading.id}`}
        style={{ paddingInlineStart: `${(heading.level - 1) * .75 + .5}rem` }}
        onClick={(event) => {
          const target = document.getElementById(heading.id);
          if (!target) return;
          event.preventDefault();
          target.scrollIntoView({ block: "start", behavior: "auto" });
          target.focus({ preventScroll: true });
        }}>{heading.label}</a>)}
    </nav>
  </details>;
}
