import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// D1: the options passed to Monaco. Monaco itself is mocked; the browser test acceptance-d1/scripts/td1.mjs is the real proof.
const editorProps: Array<{ options?: Record<string, unknown> }> = [];
vi.mock("@monaco-editor/react", () => ({
  default: (props: { options?: Record<string, unknown> }) => { editorProps.push(props); return <div data-testid="monaco" />; },
}));
vi.mock("./ThemeProvider", () => ({ useTheme: () => ({ theme: "light" }) }));

import { CodeEditor } from "./CodeEditor";

describe("CodeEditor Monaco options (D1)", () => {
  beforeEach(() => { editorProps.length = 0; });

  it("turns occurrencesHighlight off for read-only editors", () => {
    render(<CodeEditor value="int x = 1;" readOnly />);
    const options = editorProps.at(-1)?.options;
    expect(options?.readOnly).toBe(true);
    expect(options?.occurrencesHighlight).toBe("off");
  });

  it("does not set occurrencesHighlight at all for editable editors (Monaco's default is kept)", () => {
    render(<CodeEditor defaultCode="// start" />);
    const options = editorProps.at(-1)?.options;
    expect(options?.readOnly).toBe(false);
    expect(options).not.toHaveProperty("occurrencesHighlight");
  });
});

// A11Y plan rev. 2, controls 1 and 2: icon-only toolbar buttons have accessible names.
describe("CodeEditor toolbar names (A11Y)", () => {
  it("names the Copy and Reset buttons; Copy reads \"Copied\" after copying", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<CodeEditor value="int x = 1;" readOnly />);
    expect(screen.getByRole("button", { name: "Reset code" })).toBeInTheDocument();
    const copy = screen.getByRole("button", { name: "Copy code" });
    expect(copy.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    fireEvent.click(copy);
    await waitFor(() => expect(screen.getByRole("button", { name: "Copied" })).toBe(copy));
  });
});

