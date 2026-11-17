import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Bold, Italic, Link2, List, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatSelection, italicMarkerAt, sourceOfTextBlock, textFieldsFromSource, type InlineFormat } from "@/lib/richText";
import type { Block } from "@/lib/blocks";

type TextBlock = Extract<Block, { type: "text" }>;

interface Props {
  block: TextBlock;
  onChange: (b: TextBlock) => void;
  /** Typing "/" in an empty block opens the insert menu (unchanged from the plain text block). */
  onSlash: () => void;
}

const sameFields = (b: TextBlock, f: { text: string; doc?: unknown }) =>
  b.text === f.text && JSON.stringify(b.doc) === JSON.stringify(f.doc);

/** Applies `fields` to the block: `doc` is written only when there is one (a plain block never gains an empty doc key). */
function withFields(b: TextBlock, f: { text: string; doc?: TextBlock["doc"] }): TextBlock {
  const { doc: _old, ...rest } = b;
  return f.doc !== undefined ? { ...rest, text: f.text, doc: f.doc } : { ...rest, text: f.text };
}

/**
 * The text block's editor: a toolbar over a plain textarea that uses a small authoring syntax (see src/lib/richText.ts). What the
 * creator types is kept locally; every change is turned into `doc` + its `text` projection (or, for a block that has never been
 * formatted, plain `text` as typed) and handed to the block editor, whose autosave does the rest.
 */
export function RichTextEditor({ block, onChange, onSlash }: Props) {
  const [source, setSource] = useState(() => sourceOfTextBlock(block));
  const area = useRef<HTMLTextAreaElement>(null);
  const hadDoc = block.doc !== undefined;

  // The block was replaced from outside (a reload, a conflict recovery): show what it now holds.
  useEffect(() => {
    if (!sameFields(block, textFieldsFromSource(source, hadDoc))) setSource(sourceOfTextBlock(block));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only an outside change of the block's content should reset the source
  }, [block.text, block.doc]);

  const commit = (next: string) => {
    setSource(next);
    const fields = textFieldsFromSource(next, hadDoc);
    if (!sameFields(block, fields)) onChange(withFields(block, fields));
  };

  /** Replaces the selection (or inserts at the caret) and then selects [selStart, selEnd) relative to the inserted text. */
  const replaceSelection = (make: (selected: string) => { text: string; select: [number, number] }) => {
    const el = area.current;
    const start = el?.selectionStart ?? source.length, end = el?.selectionEnd ?? source.length;
    const { text, select } = make(source.slice(start, end));
    commit(source.slice(0, start) + text + source.slice(end));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + select[0], start + select[1]); });
  };

  /**
   * Formats the selection with `format` (its text is escaped and its existing formatting kept: see formatSelection), or, with no
   * selection, inserts `marker` + placeholder + `marker` at the caret with the placeholder selected.
   */
  const applyFormat = (format: InlineFormat, empty: (before: string) => { text: string; select: [number, number] }) => {
    const el = area.current;
    const start = el?.selectionStart ?? source.length, end = el?.selectionEnd ?? source.length;
    const selected = source.slice(start, end);
    if (!selected) { replaceSelection(() => empty(source.slice(0, start))); return; }
    const atLineStart = start === 0 || source[start - 1] === "\n";
    const { text, firstAddress } = formatSelection(selected, format, atLineStart, source[start - 1]);
    replaceSelection(() => ({ text, select: firstAddress ?? [0, text.length] }));
  };
  const wrapEmpty = (marker: string, placeholder: string) => () =>
    ({ text: marker + placeholder + marker, select: [marker.length, marker.length + placeholder.length] as [number, number] });

  const bold = () => applyFormat({ kind: "bold" }, wrapEmpty("**", "bold text"));
  const italic = () => applyFormat({ kind: "italic" }, (before) => wrapEmpty(italicMarkerAt(before, before.length), "italic text")());
  const link = () => applyFormat({ kind: "link", href: "https://" }, () => ({ text: "[link text](https://)", select: [12, 20] }));

  /** Turns the selected lines (or the caret's line) into list items, or back into plain lines when they all already are. */
  const list = (ordered: boolean) => {
    const el = area.current;
    const selStart = el?.selectionStart ?? 0, selEnd = el?.selectionEnd ?? 0;
    const start = source.lastIndexOf("\n", selStart - 1) + 1;
    const endNl = source.indexOf("\n", selEnd);
    const end = endNl < 0 ? source.length : endNl;
    const lines = source.slice(start, end).split("\n");
    const marker = ordered ? /^\d+[.)]\s+/ : /^[-•]\s+/;
    const all = lines.every((l) => marker.test(l));
    const next = lines.map((l, i) => (all ? l.replace(marker, "") : `${ordered ? `${i + 1}. ` : "- "}${l.replace(/^(\d+[.)]|[-•])\s+/, "")}`)).join("\n");
    commit(source.slice(0, start) + next + source.slice(end));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start, start + next.length); });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "b") { e.preventDefault(); bold(); }
    else if (k === "i") { e.preventDefault(); italic(); }
    else if (k === "k") { e.preventDefault(); link(); }
  };

  const tool = (label: string, shortcut: string | null, Icon: typeof Bold, run: () => void) => (
    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={label} title={shortcut ? `${label} (${shortcut})` : label}
      onMouseDown={(e) => e.preventDefault() /* keep the textarea's selection */} onClick={run}>
      <Icon className="h-3.5 w-3.5" />
    </Button>
  );

  return (
    <div className="space-y-1">
      <div role="toolbar" aria-label="Text formatting" className="flex items-center gap-0.5">
        {tool("Bold", "Ctrl+B", Bold, bold)}
        {tool("Italic", "Ctrl+I", Italic, italic)}
        {tool("Link", "Ctrl+K", Link2, link)}
        {tool("Bulleted list", null, List, () => list(false))}
        {tool("Numbered list", null, ListOrdered, () => list(true))}
      </div>
      <Textarea ref={area} aria-label="Text" rows={6} value={source} placeholder='Write your text... (type "/" for more blocks)'
        onKeyDown={onKeyDown}
        onChange={(e) => (source === "" && e.target.value === "/" ? onSlash() : commit(e.target.value))} />
    </div>
  );
}
