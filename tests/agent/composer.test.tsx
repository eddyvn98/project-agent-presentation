import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
vi.mock("../../components/features/projects/ProjectAgentModelPicker", () => ({ ProjectAgentModelPicker: () => null }));
vi.mock("../../components/features/projects/useDictation", () => ({ useDictation: () => ({ supported: false }) }));
vi.mock("@/stores/useAgentComposerStore", () => ({ useAgentComposerStore: () => ({ webSearch: false, setWebSearch: vi.fn() }) }));
import { ProjectAgentComposer } from "../../components/features/projects/ProjectAgentComposer";
const props = () => ({ value: "Synthetic request", onChange: vi.fn(), onSubmit: vi.fn((event) => event.preventDefault()), onAttach: vi.fn(), onFiles: vi.fn(), placeholder: "Message", ariaLabel: "Message" });
it.each([{ busy: true }, { disabled: true }])("guards keyboard and direct form submission %j", (override) => {
  const options = { ...props(), ...override };
  const { container } = render(<ProjectAgentComposer {...options} />);
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
  fireEvent.submit(container.querySelector("form")!);
  expect(options.onSubmit).not.toHaveBeenCalled();
});
it("preserves Shift+Enter and IME composition", () => {
  const options = props(); render(<ProjectAgentComposer {...options} />);
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", shiftKey: true });
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", isComposing: true });
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", keyCode: 229 });
  expect(options.onSubmit).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
  expect(options.onSubmit).toHaveBeenCalledTimes(1);
});
it("navigates message options by keyboard and restores trigger focus", () => {
  render(<ProjectAgentComposer {...props()} />);
  const trigger = screen.getByRole("button", { name: "Add to message" });
  fireEvent.click(trigger);
  const menu = screen.getByRole("menu", { name: "Message options" });
  expect(menu).toBeTruthy();
  for (const label of ["Scheduled tasks", "Agent Control Center", "Skill Registry", "Workflow Builder"]) {
    expect(screen.getByRole("menuitem", { name: label })).toBeTruthy();
  }
  const attach = screen.getByRole("menuitem", { name: /Add files and images/i });
  expect(document.activeElement).toBe(attach);
  fireEvent.keyDown(attach, { key: "ArrowDown" });
  expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: /Scheduled tasks/i }));
  fireEvent.keyDown(document.activeElement!, { key: "End" });
  expect(document.activeElement).toBe(screen.getByRole("menuitemcheckbox", { name: /Web search/i }));
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
it("does not ingest files while disabled", () => {
  const options = props(); const { container } = render(<ProjectAgentComposer {...options} disabled />);
  fireEvent.paste(screen.getByRole("textbox"), { clipboardData: { files: [new File(["test"], "test.txt")] } });
  fireEvent.drop(container.querySelector("form")!, { dataTransfer: { files: [new File(["test"], "test.txt")] } });
  expect(options.onFiles).not.toHaveBeenCalled();
});

it("permits programmatic replies when a parent supplies its prompt through a ref", () => {
  const options = { ...props(), value: "" };
  const { container } = render(<ProjectAgentComposer {...options} />);
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
  expect(options.onSubmit).not.toHaveBeenCalled();
  fireEvent.submit(container.querySelector("form")!);
  expect(options.onSubmit).toHaveBeenCalledTimes(1);
});
