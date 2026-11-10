import { useState, type CSSProperties } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";
import { SlashMenu } from "@/components/editor/SlashMenu";
import { MediaUploader } from "@/components/media/MediaUploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  BLOCK_LABELS, MAX_BLOCKS, blockLabel, insertBlock, isUnsupported, moveBlock, moveBlockTo, newBlock, removeBlock, replaceBlock, updateBlock, urlProblem, withImageAsset, withImageUrl, withoutImageAsset,
  type Block, type BlockType, type EditorBlock, type UnsupportedBlock,
} from "@/lib/blocks";

const HINTS: Partial<Record<BlockType, string>> = {
  text: 'Blank line = new paragraph. Start lines with "- " for bullets or "1. " for numbered lists.',
  html: "Styled HTML and CSS. It is shown in an isolated frame: scripts, forms, links to other sites and external images/fonts do not run or load (use an image block for pictures).",
  svg: "Paste the <svg>...</svg> markup. Scripts inside SVGs are ignored.",
  image: "Upload an image (JPEG, PNG or WebP, up to 5 MB), or paste a link to one (https://...). Entering a link replaces an uploaded image.",
  video: "YouTube or Vimeo link, or a direct .mp4 link.",
};

function Fields({ block, onChange, problem, onSlash }: { block: Block; onChange: (b: Block) => void; problem: string | null; onSlash: () => void }) {
  const set = (patch: Record<string, unknown>) => onChange({ ...block, ...patch } as Block);
  const [uploading, setUploading] = useState(false);   // an image upload is running: its link field is locked (see MediaUploader)
  const label = BLOCK_LABELS[block.type];
  switch (block.type) {
    case "heading":
      return (
        <div className="flex gap-2">
          <Select value={String(block.level)} onValueChange={(v) => set({ level: Number(v) })}>
            <SelectTrigger className="w-32" aria-label="Heading level"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="2">Heading</SelectItem>
              <SelectItem value="3">Sub-heading</SelectItem>
            </SelectContent>
          </Select>
          <Input aria-label="Heading text" value={block.text} onChange={(e) => set({ text: e.target.value })} placeholder="Heading text" />
        </div>
      );
    case "text":
      // typing "/" in an empty text block opens the insert menu instead of writing the slash
      return <Textarea aria-label="Text" rows={6} value={block.text} placeholder='Write your text... (type "/" for more blocks)'
        onChange={(e) => (block.text === "" && e.target.value === "/" ? onSlash() : set({ text: e.target.value }))} />;
    case "code":
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <Input aria-label="Code language" value={block.language} onChange={(e) => set({ language: e.target.value })} placeholder="language (java, python...)" />
            <Input aria-label="Code caption" className="col-span-2" value={block.caption} onChange={(e) => set({ caption: e.target.value })} placeholder="Caption (optional)" />
          </div>
          <Textarea aria-label="Code" rows={10} className="font-mono text-xs" value={block.code} onChange={(e) => set({ code: e.target.value })} placeholder="Code snippet" />
        </div>
      );
    case "image":
      return (
        <div className="space-y-2">
          <MediaUploader label="Image" assetId={block.assetId} onUploaded={(a) => onChange(withImageAsset(block, a.id))} onRemove={() => onChange(withoutImageAsset(block))} onBusyChange={setUploading} />
          <Input aria-label="Image link" aria-invalid={!!problem} value={block.url} disabled={uploading} title={uploading ? "Wait for the upload to finish, or cancel it, to enter a link." : undefined} onChange={(e) => { if (!uploading) onChange(withImageUrl(block, e.target.value)); }} placeholder="https://..." />
          {problem && <p role="alert" className="text-xs text-destructive">{problem}</p>}
          <Input aria-label="Image caption" value={block.caption} onChange={(e) => set({ caption: e.target.value })} placeholder="Caption / alt text (optional)" />
        </div>
      );
    case "video":
      return (
        <div className="space-y-2">
          <Input aria-label={`${label} link`} aria-invalid={!!problem} value={block.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://..." />
          {problem && <p role="alert" className="text-xs text-destructive">{problem}</p>}
          <Input aria-label={`${label} caption`} value={block.caption} onChange={(e) => set({ caption: e.target.value })} placeholder="Caption / alt text (optional)" />
        </div>
      );
    case "html":
      return (
        <div className="space-y-2">
          <Textarea aria-label="HTML" rows={10} className="font-mono text-xs" value={block.html} onChange={(e) => set({ html: e.target.value })} placeholder="<div>...</div>" />
          <div className="flex items-center gap-2">
            <Label htmlFor={`h-${block.id}`} className="text-xs">Height (px)</Label>
            <Input id={`h-${block.id}`} type="number" className="w-24" value={block.height} onChange={(e) => set({ height: Number(e.target.value) || 360 })} />
          </div>
        </div>
      );
    case "svg":
      return (
        <div className="space-y-2">
          <Textarea aria-label="SVG" rows={8} className="font-mono text-xs" value={block.svg} onChange={(e) => set({ svg: e.target.value })} placeholder="<svg ...>...</svg>" />
          <Input aria-label="SVG caption" value={block.caption} onChange={(e) => set({ caption: e.target.value })} placeholder="Caption (optional)" />
        </div>
      );
    case "callout":
      return (
        <div className="space-y-2">
          <Select value={block.variant} onValueChange={(v) => set({ variant: v })}>
            <SelectTrigger className="w-40" aria-label="Callout style"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="tip">Tip</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
            </SelectContent>
          </Select>
          <Textarea aria-label="Callout text" rows={3} value={block.text} onChange={(e) => set({ text: e.target.value })} placeholder="Callout text" />
        </div>
      );
    case "divider":
      return <p className="text-xs text-muted-foreground">A horizontal line.</p>;
  }
}

function UnsupportedCard({ block }: { block: UnsupportedBlock }) {
  return (
    <p className="text-sm text-muted-foreground" data-testid="unsupported-block">
      This block's type ("{String(block.original.type)}") can't be edited in this version of the editor. It is kept exactly as
      it was saved; you can move or delete it.
    </p>
  );
}

/** One block card that can be dragged by its handle (pointer) or with the keyboard (Space, arrows, Space). */
function SortableCard({ id, disabled, label, index, children, ...rest }: {
  id: string; disabled?: boolean; label: string; index: number; children: (handle: React.ReactNode) => React.ReactNode;
} & Record<string, unknown>) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  const handle = (
    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 cursor-grab touch-none" ref={setActivatorNodeRef}
      {...attributes} {...listeners} disabled={disabled} aria-label={`Drag block ${index + 1} (${label}) to reorder`}>
      <GripVertical className="h-3.5 w-3.5" />
    </Button>
  );
  return <div ref={setNodeRef} style={style} className="rounded-lg border border-border p-3 space-y-2 bg-background" {...rest}>{children(handle)}</div>;
}

interface Props {
  blocks: EditorBlock[];
  onChange: (blocks: EditorBlock[]) => void;
  /** Per-block problems (from `bodyProblems`), keyed by block id. */
  problems?: Record<string, string>;
  disabled?: boolean;
}

/**
 * The one block editor, used for every kind of page. Controlled: it never saves anything itself. Blocks are identified
 * by id (kept across edits and reordering); new ids exist only for newly added blocks.
 */
export function BlockEditor({ blocks, onChange, problems = {}, disabled }: Props) {
  const full = blocks.length >= MAX_BLOCKS;
  const [slashFor, setSlashFor] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (disabled || !over || active.id === over.id) return;
    onChange(moveBlockTo(blocks, String(active.id), blocks.findIndex((b) => b.id === over.id)));
  };
  const pickSlash = (type: BlockType) => {
    const id = slashFor;
    setSlashFor(null);
    if (id && type !== "text") onChange(replaceBlock(blocks, id, newBlock(type)));   // the empty text block becomes the chosen one
  };
  return (
    <div className="space-y-3" data-testid="block-editor">
      {blocks.length === 0 && (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border p-6 text-center">
          No blocks yet. Add text, code, images, video, SVG or HTML below.
        </p>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          {blocks.map((b, i) => {
            const label = blockLabel(b);
            return (
              <SortableCard key={b.id} id={b.id} index={i} label={label} disabled={disabled}
                data-testid={`block-${i}`} data-block-id={b.id} data-block-type={isUnsupported(b) ? "unsupported" : b.type}>
                {(handle) => (
                  <>
                    <div className="flex items-center gap-1">
                      {handle}
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex-1">{label}</span>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`Move block ${i + 1} (${label}) up`}
                        disabled={disabled || i === 0} onClick={() => onChange(moveBlock(blocks, b.id, -1))}><ArrowUp className="h-3.5 w-3.5" /></Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`Move block ${i + 1} (${label}) down`}
                        disabled={disabled || i === blocks.length - 1} onClick={() => onChange(moveBlock(blocks, b.id, 1))}><ArrowDown className="h-3.5 w-3.5" /></Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label={`Delete block ${i + 1} (${label})`}
                        disabled={disabled} onClick={() => onChange(removeBlock(blocks, b.id))}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                    {isUnsupported(b) ? <UnsupportedCard block={b} /> : (
                      <>
                        <fieldset disabled={disabled} className="contents">
                          <Fields block={b} problem={problems[b.id] ?? urlProblem(b)} onChange={(nb) => onChange(updateBlock(blocks, b.id, nb))} onSlash={() => setSlashFor(b.id)} />
                        </fieldset>
                        {problems[b.id] && b.type !== "image" && b.type !== "video" && (
                          <p role="alert" className="text-xs text-destructive" data-testid="block-problem">{problems[b.id]}</p>
                        )}
                        {HINTS[b.type] && <p className="text-xs text-muted-foreground">{HINTS[b.type]}</p>}
                      </>
                    )}
                  </>
                )}
              </SortableCard>
            );
          })}
        </SortableContext>
      </DndContext>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" className="gap-1 w-full" disabled={disabled || full}><Plus className="h-4 w-4" />Add block</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {(Object.keys(BLOCK_LABELS) as BlockType[]).map((t) => (
            <DropdownMenuItem key={t} onClick={() => onChange(insertBlock(blocks, newBlock(t)))}>{BLOCK_LABELS[t]}</DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {full && <p className="text-xs text-muted-foreground">A page can have at most {MAX_BLOCKS} blocks.</p>}
      <SlashMenu open={slashFor !== null} onOpenChange={(o) => !o && setSlashFor(null)} onPick={pickSlash} />
    </div>
  );
}
