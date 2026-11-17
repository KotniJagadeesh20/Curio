import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { MAX_TABLE_COLS, MAX_TABLE_ROWS, type EditorBlock, type TableBlock } from "@/lib/blocks";
import { BlockEditor } from "./BlockEditor";

vi.mock("@/components/CodeEditor", () => ({ CodeEditor: ({ value }: { value: string }) => <pre>{value}</pre> }));

const tableBlock = (rows: string[][], hasHeader = true, id = "tb"): EditorBlock => ({ id, type: "table", hasHeader, caption: "", rows });
const text = (id: string, t: string): EditorBlock => ({ id, type: "text", text: t });

function Host({ initial, onState }: { initial: EditorBlock[]; onState: (b: EditorBlock[]) => void }) {
  const [blocks, setBlocks] = useState(initial);
  return <BlockEditor blocks={blocks} onChange={(b) => { setBlocks(b); onState(b); }} />;
}
function mount(initial: EditorBlock[]) {
  let latest = initial;
  render(<Host initial={initial} onState={(b) => { latest = b; }} />);
  return { latest: () => latest, table: (i = 0) => latest.filter((b) => b.type === "table")[i] as TableBlock };
}
const btn = (name: string | RegExp) => screen.getByRole("button", { name });

describe("table block in the editor", () => {
  it("is offered in the insert menu and inserts a 2x2 table with a header", async () => {
    const m = mount([text("a", "before"), text("e", "")]);
    fireEvent.change(screen.getAllByLabelText("Text")[1], { target: { value: "/" } });
    fireEvent.click(await screen.findByRole("option", { name: "Table" }));
    await waitFor(() => expect(m.latest().map((b) => b.type)).toEqual(["text", "table"]));
    expect(m.latest()[0].id).toBe("a");
    expect(m.table()).toMatchObject({ hasHeader: true, caption: "", rows: [["", ""], ["", ""]] });
    expect(screen.getByLabelText("Row 1, column 1 (header)")).toBeInTheDocument();
    expect(screen.getByLabelText("Row 2, column 2")).toBeInTheDocument();
  });

  it("edits one cell; the block keeps its id and position", () => {
    const m = mount([text("a", "x"), tableBlock([["Dish", "Minutes"], ["", ""]]), text("c", "y")]);
    fireEvent.change(screen.getByLabelText("Row 2, column 1"), { target: { value: "Bread" } });
    expect(m.latest().map((b) => b.id)).toEqual(["a", "tb", "c"]);
    expect(m.table().rows).toEqual([["Dish", "Minutes"], ["Bread", ""]]);
  });

  it("adds and removes rows and columns", () => {
    const m = mount([tableBlock([["A", "B"], ["1", "2"]])]);
    fireEvent.click(btn("Add row"));
    expect(m.table().rows).toEqual([["A", "B"], ["1", "2"], ["", ""]]);
    fireEvent.click(btn("Add column"));
    expect(m.table().rows).toEqual([["A", "B", ""], ["1", "2", ""], ["", "", ""]]);
    fireEvent.click(btn("Remove row 1"));
    expect(m.table().rows).toEqual([["1", "2", ""], ["", "", ""]]);
    fireEvent.click(btn("Remove column 2"));
    expect(m.table().rows).toEqual([["1", ""], ["", ""]]);
  });

  it("the last row and column cannot be removed (1x1 minimum)", () => {
    mount([tableBlock([["only"]])]);
    expect(btn("Remove row 1")).toBeDisabled();
    expect(btn("Remove column 1")).toBeDisabled();
  });

  it("Add row / Add column are disabled at 50 rows / 10 columns", () => {
    mount([tableBlock(Array.from({ length: MAX_TABLE_ROWS }, () => Array<string>(MAX_TABLE_COLS).fill("")))]);
    expect(btn("Add row")).toBeDisabled();
    expect(btn("Add column")).toBeDisabled();
  });

  it("toggles the header row", () => {
    const m = mount([tableBlock([["H"], ["d"]], true)]);
    const toggle = screen.getByRole("switch", { name: "First row is a header" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.click(toggle);
    expect(m.table().hasHeader).toBe(false);
    expect(screen.queryByLabelText(/\(header\)/)).toBeNull();
  });

  it("edits the caption", () => {
    const m = mount([tableBlock([["a"]])]);
    fireEvent.change(screen.getByLabelText("Table caption"), { target: { value: "Oven times" } });
    expect(m.table().caption).toBe("Oven times");
  });

  it("shows a client-side problem for a table the server would refuse (ragged rows)", () => {
    mount([tableBlock([["a", "b"], ["c"]])]);
    expect(screen.getByTestId("block-problem")).toHaveTextContent("Every row needs the same number of cells.");
  });

  it("the grid sits in its own horizontal scroll box", () => {
    mount([tableBlock([["a"]])]);
    expect(screen.getByTestId("table-editor-scroll")).toHaveClass("overflow-x-auto");
    expect(within(screen.getByTestId("table-editor")).getByRole("table")).toBeInTheDocument();
  });

  it("cells, row/column controls and the toggle are reachable by keyboard (real buttons, inputs and a switch)", () => {
    mount([tableBlock([["a", "b"], ["c", "d"]])]);
    for (const el of [screen.getByLabelText("Row 1, column 1 (header)"), btn("Remove row 2"), btn("Remove column 1"), btn("Add row"), screen.getByRole("switch")]) {
      expect(el.tabIndex).toBeGreaterThanOrEqual(0);
    }
  });
});
