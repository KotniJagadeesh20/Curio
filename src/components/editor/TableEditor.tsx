import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  MAX_TABLE_CAPTION, MAX_TABLE_CELL, MAX_TABLE_COLS, MAX_TABLE_ROWS, addTableColumn, addTableRow, removeTableColumn, removeTableRow, setTableCell,
  type TableBlock,
} from "@/lib/blocks";

interface Props {
  block: TableBlock;
  onChange: (b: TableBlock) => void;
}

/**
 * Edits a table block: plain-text cells, rows/columns added at the end or removed individually (never below 1x1), an
 * optional header row and a caption. Controlled; the block editor's autosave picks up every change.
 */
export function TableEditor({ block, onChange }: Props) {
  const rows = block.rows;
  const cols = rows[0]?.length ?? 0;
  const headerToggleId = `table-header-${block.id}`;
  return (
    <div className="space-y-2" data-testid="table-editor">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-1" disabled={rows.length >= MAX_TABLE_ROWS}
          onClick={() => onChange(addTableRow(block))}><Plus className="h-3.5 w-3.5" />Add row</Button>
        <Button type="button" variant="outline" size="sm" className="gap-1" disabled={cols >= MAX_TABLE_COLS}
          onClick={() => onChange(addTableColumn(block))}><Plus className="h-3.5 w-3.5" />Add column</Button>
        <div className="flex items-center gap-2 ml-auto">
          <Switch id={headerToggleId} checked={block.hasHeader} onCheckedChange={(v) => onChange({ ...block, hasHeader: v })} />
          <Label htmlFor={headerToggleId} className="text-xs">First row is a header</Label>
        </div>
      </div>
      <div className="overflow-x-auto" data-testid="table-editor-scroll">
        <table className="border-collapse text-sm">
          <thead>
            <tr>
              <td />
              {Array.from({ length: cols }, (_, j) => (
                <td key={j} className="p-1 text-center">
                  <Button type="button" variant="ghost" size="sm" className="h-6 px-1 text-xs text-muted-foreground" disabled={cols <= 1}
                    aria-label={`Remove column ${j + 1}`} onClick={() => onChange(removeTableColumn(block, j))}>
                    <Minus className="h-3 w-3" />
                  </Button>
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const isHeader = block.hasHeader && i === 0;
              return (
                <tr key={i}>
                  <td className="p-1">
                    <Button type="button" variant="ghost" size="sm" className="h-6 px-1 text-xs text-muted-foreground" disabled={rows.length <= 1}
                      aria-label={`Remove row ${i + 1}`} onClick={() => onChange(removeTableRow(block, i))}>
                      <Minus className="h-3 w-3" />
                    </Button>
                  </td>
                  {r.map((c, j) => (
                    <td key={j} className="p-1">
                      <Input aria-label={`Row ${i + 1}, column ${j + 1}${isHeader ? " (header)" : ""}`} value={c} maxLength={MAX_TABLE_CELL}
                        className={`min-w-[8rem] h-8 ${isHeader ? "font-semibold" : ""}`}
                        onChange={(e) => onChange(setTableCell(block, i, j, e.target.value))} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Input aria-label="Table caption" value={block.caption} maxLength={MAX_TABLE_CAPTION}
        onChange={(e) => onChange({ ...block, caption: e.target.value })} placeholder="Caption (optional)" />
      <p className="text-xs text-muted-foreground">
        {rows.length} of {MAX_TABLE_ROWS} rows, {cols} of {MAX_TABLE_COLS} columns.
      </p>
    </div>
  );
}
