import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { BLOCK_LABELS, type BlockType } from "@/lib/blocks";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (type: BlockType) => void;
}

/** The "/" insert menu: type to filter, arrow keys + Enter (or click) to choose, Escape to close. Built on cmdk. */
export function SlashMenu({ open, onOpenChange, onPick }: Props) {
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <DialogTitle className="sr-only">Insert a block</DialogTitle>
      <DialogDescription className="sr-only">Type to filter, use the arrow keys to move and Enter to insert.</DialogDescription>
      <CommandInput placeholder="Type a block name..." aria-label="Filter blocks" />
      <CommandList>
        <CommandEmpty>No matching block.</CommandEmpty>
        <CommandGroup heading="Insert block">
          {(Object.keys(BLOCK_LABELS) as BlockType[]).map((t) => (
            <CommandItem key={t} value={BLOCK_LABELS[t]} onSelect={() => onPick(t)}>{BLOCK_LABELS[t]}</CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
