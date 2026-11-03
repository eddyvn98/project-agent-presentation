import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
vi.mock("../../components/features/projects/ProjectAgentModelPicker", () => ({ ProjectAgentModelPicker: () => null }));
vi.mock("../../components/features/projects/useDictation", () => ({ useDictation: () => ({ supported: false }) }));
vi.mock("@/stores/useAgentComposerStore", () => ({ useAgentComposerStore: () => ({ webSearch: false, setWebSearch: vi.fn() }) }));
import { ProjectAgentComposer } from "../../components/features/projects/ProjectAgentComposer";
import { ProjectAgentRegionSelect } from "../../components/features/projects/ProjectAgentRegionSelect";

it("opens mobile camera independently from the general file picker", () => {
  const onCamera = vi.fn(), onAttach = vi.fn();
  render(<ProjectAgentComposer value="" onChange={vi.fn()} onSubmit={vi.fn()} onCamera={onCamera} onAttach={onAttach} placeholder="Message" ariaLabel="Message" />);
  fireEvent.click(screen.getByRole("button", { name: "Take photo" }));
  expect(onCamera).toHaveBeenCalledOnce();
  expect(onAttach).not.toHaveBeenCalled();
});

it("ignores accidental taps when drawing on a PDF with a finger", () => {
  const onSubmit = vi.fn();
  render(<div style={{ width: 350, height: 350, position: "relative" }}><ProjectAgentRegionSelect onSubmit={onSubmit}/></div>);
  const field = screen.getByLabelText("Drag to mark the area to change");
  Object.defineProperty(field, "setPointerCapture", { value: vi.fn() });
  Object.defineProperty(field, "getBoundingClientRect", { value: () => ({ left: 0, top: 0, width: 350, height: 350 }) });
  fireEvent.pointerDown(field, { clientX: 20, clientY: 20, pointerId: 1 });
  fireEvent.pointerUp(field, { clientX: 20, clientY: 20, pointerId: 1 });
  expect(screen.queryByPlaceholderText("Describe the change for this area")).toBeNull();
  expect(onSubmit).not.toHaveBeenCalled();
});
