import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAX_TABLE_CAPTION, MAX_TABLE_CELL, MAX_TABLE_CHARS, MAX_TABLE_COLS, MAX_TABLE_ROWS, UNSUPPORTED, addTableColumn, addTableRow, bodyProblems,
  hasMeaningfulContent, isWellFormedTable, newBlock, normalizeBlocks, readBlocksForEditing, removeTableColumn, removeTableRow, serializeBlocks,
  setTableCell, tableProblem, type EditorBlock, type TableBlock,
} from "@/lib/blocks";

const table = (rows: string[][], hasHeader = true, caption = ""): TableBlock => ({ id: "t", type: "table", hasHeader, caption, rows });
const grid = (r: number, c: number, v = "x") => Array.from({ length: r }, () => Array<string>(c).fill(v));

describe("the table limits mirror BlockRules (reads the Java source)", () => {
  it("rows, columns, cell, total and caption caps are the server's", () => {
    const java = readFileSync(resolve(process.cwd(), "backend/src/main/java/com/codemastery/blocks/BlockRules.java"), "utf8");
    const num = (name: string) => Number(new RegExp(`${name}\\s*=\\s*([0-9_]+)`).exec(java)![1].replace(/_/g, ""));
    expect(MAX_TABLE_ROWS).toBe(num("MAX_TABLE_ROWS"));
    expect(MAX_TABLE_COLS).toBe(num("MAX_TABLE_COLS"));
    expect(MAX_TABLE_CELL).toBe(num("MAX_CELL"));
    expect(MAX_TABLE_CHARS).toBe(num("MAX_TABLE_CHARS"));
    expect(MAX_TABLE_CAPTION).toBe(num("MAX_CAPTION"));
    expect(java).toContain('"table", Set.of("hasHeader", "rows", "caption")');
  });
});

describe("creating a table", () => {
  it("a new table is a 2x2 grid of empty cells with a header row and no caption, and passes validation", () => {
    const t = newBlock("table") as TableBlock;
    expect(t).toMatchObject({ type: "table", hasHeader: true, caption: "", rows: [["", ""], ["", ""]] });
    expect(Object.keys(t).sort()).toEqual(["caption", "hasHeader", "id", "rows", "type"]);   // only the fields the server accepts
    expect(tableProblem(t)).toBeNull();
  });
});

describe("table edits are pure, keep the table rectangular, and never go below 1x1 or above the caps", () => {
  const t = table([["A", "B"], ["1", "2"]]);

  it("sets one cell, leaving the original untouched", () => {
    const out = setTableCell(t, 1, 0, "one");
    expect(out.rows).toEqual([["A", "B"], ["one", "2"]]);
    expect(t.rows).toEqual([["A", "B"], ["1", "2"]]);
    expect(setTableCell(t, 5, 0, "x")).toBe(t);
    expect(setTableCell(t, 0, 9, "x")).toBe(t);
  });

  it("adds and removes rows", () => {
    expect(addTableRow(t).rows).toEqual([["A", "B"], ["1", "2"], ["", ""]]);
    expect(addTableRow(t, 1).rows).toEqual([["A", "B"], ["", ""], ["1", "2"]]);
    expect(removeTableRow(t, 0).rows).toEqual([["1", "2"]]);
    expect(removeTableRow(t, 7)).toBe(t);
  });

  it("adds and removes columns", () => {
    expect(addTableColumn(t).rows).toEqual([["A", "B", ""], ["1", "2", ""]]);
    expect(addTableColumn(t, 0).rows).toEqual([["", "A", "B"], ["", "1", "2"]]);
    expect(removeTableColumn(t, 1).rows).toEqual([["A"], ["1"]]);
    expect(removeTableColumn(t, -1)).toBe(t);
  });

  it("the last row and the last column cannot be removed", () => {
    const one = table([["only"]]);
    expect(removeTableRow(one, 0)).toBe(one);
    expect(removeTableColumn(one, 0)).toBe(one);
  });

  it("rows stop at 50 and columns at 10", () => {
    const tall = table(grid(MAX_TABLE_ROWS, 1));
    expect(addTableRow(tall)).toBe(tall);
    const wide = table(grid(1, MAX_TABLE_COLS));
    expect(addTableColumn(wide)).toBe(wide);
  });
});

describe("tableProblem mirrors the server's table rules", () => {
  it.each([
    ["a valid table", table([["a"]]), null],
    ["no rows", table([]), "A table needs at least one row."],
    ["an empty row", table([["a"], []]), "Every row needs at least one cell."],
    ["ragged rows", table([["a", "b"], ["c"]]), "Every row needs the same number of cells."],
    ["a non-text cell", { ...table([["a"]]), rows: [[5]] } as unknown as TableBlock, "Every cell must be text."],
    ["a non-boolean header flag", { ...table([["a"]]), hasHeader: "yes" } as unknown as TableBlock, "The header setting must be true or false."],
    ["51 rows", table(grid(MAX_TABLE_ROWS + 1, 1)), "A table can have at most 50 rows."],
    ["11 columns", table(grid(1, MAX_TABLE_COLS + 1)), "A table can have at most 10 columns."],
    ["a 501-character cell", table([["x".repeat(MAX_TABLE_CELL + 1)]]), "A cell is too long (limit 500 characters)."],
    ["a 500-character cell", table([["x".repeat(MAX_TABLE_CELL)]]), null],
    ["over 20,000 characters in all", table(grid(41, 1, "x".repeat(500))), "This table has too much text (limit 20000 characters in all)."],
    ["exactly 20,000 characters", table(grid(40, 1, "x".repeat(500))), null],
    ["a 501-character caption", table([["a"]], true, "c".repeat(MAX_TABLE_CAPTION + 1)), "The caption is too long (limit 500 characters)."],
  ])("%s", (_n, t, expected) => expect(tableProblem(t as EditorBlock)).toBe(expected));

  it("is reported per block by bodyProblems, and not for other blocks", () => {
    const bad = { ...table([["a", "b"], ["c"]]), id: "bad" };
    const { fields } = bodyProblems([bad, { id: "x", type: "text", text: "hi" }]);
    expect(fields).toEqual({ bad: "Every row needs the same number of cells." });
  });
});

describe("hasMeaningfulContent: same rule as the server's tableHasData", () => {
  it.each([
    ["header-only table", table([["Dish", "Minutes"]], true), false],
    ["header and blank data row", table([["Dish", "Minutes"], ["  ", ""]], true), false],
    ["header and a data cell", table([["Dish", "Minutes"], ["Bread", ""]], true), true],
    ["no header, one filled cell", table([["", "x"]], false), true],
    ["no header, all blank", table([["", " "]], false), false],
  ])("%s -> %s", (_n, t, expected) => expect(hasMeaningfulContent([t])).toBe(expected));
});

describe("reading stored tables", () => {
  it("a well-formed stored table is editable, keeps its id, and is written back unchanged", () => {
    const stored = { id: "tb", type: "table", hasHeader: true, caption: "Oven times", rows: [["Dish", "Minutes"], ["Bread", "35"]] };
    const { blocks, unreadable } = readBlocksForEditing([stored]);
    expect(unreadable).toBe(0);
    expect(blocks[0].type).toBe("table");
    expect(serializeBlocks(blocks)[0]).toEqual(stored);
  });

  it("a stored table without hasHeader is read as having no header (the server's default), not the new-table default", () => {
    const { blocks } = readBlocksForEditing([{ id: "tb", type: "table", rows: [["a"]] }]);
    expect((blocks[0] as TableBlock).hasHeader).toBe(false);
  });

  it("a malformed stored table is kept read-only and byte-for-byte, never opened in the table editor", () => {
    for (const bad of [{ type: "table", rows: [] }, { type: "table", rows: [["a"], ["b", "c"]] }, { type: "table", rows: "oops" }, { type: "table", rows: [[1]] }, { type: "table", hasHeader: "y", rows: [["a"]] }]) {
      const { blocks } = readBlocksForEditing([bad]);
      expect(blocks[0].type).toBe(UNSUPPORTED);
      expect(serializeBlocks(blocks)[0]).toBe(bad);
    }
  });

  it("isWellFormedTable and normalizeBlocks (the renderer's input) drop a malformed table", () => {
    expect(isWellFormedTable({ rows: [["a"]] })).toBe(true);
    expect(isWellFormedTable({ rows: [["a"]], caption: 3 })).toBe(false);
    expect(normalizeBlocks([{ id: "a", type: "table", rows: "oops" }, { id: "b", type: "table", rows: [["x"]] }]).map((b) => b.id)).toEqual(["b"]);
  });
});
