# Project Agent Presentation Lab

A neutral, public extraction of the Project Agent response renderer. This repository focuses on how answers are presented: Markdown, math-ready content, citations, image handling, charts, diagrams, step explorers, forms, and document cards. It does not contain the agent runtime, credentials, private prompts, customer data, or deployment configuration.

## Current baseline

The `src/` folder contains the extracted React presentation modules. The host application supplies Tailwind CSS and the listed UI dependencies. App-specific task/file types are represented by small adapter interfaces in `src/lib/project-agent/types.ts`.

The renderer uses fenced `agent-ui` JSON blocks for structured visuals and `agent-doc` for copy-ready documents. Keep examples synthetic and portable.

## Improvement task

Improve the presentation quality to feel clear, varied, and readable in a chat: use visual hierarchy, responsive image sizing and enlargement, legible diagrams/explorers, readable math, and compact source citations. Preserve accessibility, safe rendering, keyboard support, and graceful fallback to Markdown when a structured block is invalid. Keep components modular and under 300 lines. Do not add backend or provider integrations.

## Integration

This is a presentation-only extraction, not a standalone agent product. The original AI-WEB-CHAT project can adopt reviewed changes by mapping the neutral protocol and adapter interfaces into its Project Agent UI.
