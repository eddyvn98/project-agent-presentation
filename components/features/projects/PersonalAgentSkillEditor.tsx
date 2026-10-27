"use client";
import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { PersonalAgentSkill } from "@/lib/project-agent/personal-agent-skills";

export interface SkillDraft { name: string; description: string; instructions: string; id?: string }
interface Props {
  open: boolean; skill: PersonalAgentSkill | null; busy: boolean;
  returnFocusTo?: HTMLElement | null; error?: string;
  onClose(): void; onSave(draft: SkillDraft): void;
}
const field = "mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:ring-slate-800";
export function PersonalAgentSkillEditor({ open, skill, busy, error, returnFocusTo, onClose, onSave }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  useEffect(() => {
    if (!open) return;
    setName(skill?.name ?? "");
    setDescription(skill?.description ?? "");
    setInstructions(skill?.instructions ?? "");
  }, [open, skill]);
  return <Dialog.Root open={open} onOpenChange={next => { if (!next && !busy) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-[2px]"/>
      <Dialog.Content onCloseAutoFocus={event => {
        event.preventDefault(); if (returnFocusTo?.isConnected) returnFocusTo.focus();
      }} className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(90vh,760px)] w-[min(94vw,640px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3 border-b p-5 dark:border-slate-800">
          <div><Dialog.Title className="text-xl font-semibold">{skill ? "Edit skill" : "Create a skill"}</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-slate-500">
              Write reusable guidance. The Agent may apply enabled skills when they match a task.
            </Dialog.Description></div>
          <Dialog.Close aria-label="Close editor" disabled={busy}
            className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4"/></Dialog.Close>
        </div>
        {error && <p role="alert" className="mx-5 mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</p>}
        <form id="personal-skill-form" className="space-y-4 overflow-y-auto p-5"
          onSubmit={event => { event.preventDefault(); if (!busy) onSave({
            ...(skill ? { id: skill.id } : {}), name: name.trim(), description: description.trim(),
            instructions: instructions.trim(),
          }); }}>
          <label className="block text-sm font-medium">Name
            <input aria-label="Skill name" className={field} value={name} maxLength={100}
              onChange={e => setName(e.target.value)} placeholder="e.g. Research fact-checker" required/>
          </label>
          <label className="block text-sm font-medium">What it helps with
            <input aria-label="Skill description" className={field} value={description} maxLength={240}
              onChange={e => setDescription(e.target.value)} placeholder="A short explanation for your library"/>
          </label>
          <label className="block text-sm font-medium">Instructions
            <textarea aria-label="Skill instructions" className={field + " min-h-48 resize-y"} value={instructions}
              maxLength={6000} onChange={e => setInstructions(e.target.value)}
              placeholder="Describe when to use this skill and the steps to follow…" required/>
          </label>
          <p className="text-xs leading-5 text-slate-500">
            Skills are guidance, not executable plugins. They cannot grant tool access or override user permissions.
            New skills start disabled so you can review before enabling them.
          </p>
        </form>
        <div className="flex justify-end gap-2 border-t p-4 dark:border-slate-800">
          <button type="button" disabled={busy} onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
          <button form="personal-skill-form" disabled={busy || name.trim().length < 3 || instructions.trim().length < 15}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-950">
            {busy ? "Saving…" : skill ? "Save changes" : "Create skill"}</button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
