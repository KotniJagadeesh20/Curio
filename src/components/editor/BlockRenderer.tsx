import { AlertTriangle, Info, Lightbulb } from "lucide-react";
import { CodeEditor } from "@/components/CodeEditor";
import { LessonText } from "@/components/LessonText";
import { OwnerImage } from "@/components/media/OwnerImage";
import { useTheme } from "@/components/ThemeProvider";
import { embedUrl, isSafeUrl, type Block } from "@/lib/blocks";
import { HTML_FRAME_SANDBOX, htmlFrameDocument, htmlFrameHeight } from "@/lib/htmlFrame";

const CALLOUT = {
  info: { icon: Info, cls: "border-accent bg-accent/5", iconCls: "text-accent" },
  tip: { icon: Lightbulb, cls: "border-emerald-500 bg-emerald-500/5", iconCls: "text-emerald-500" },
  warning: { icon: AlertTriangle, cls: "border-amber-500 bg-amber-500/5", iconCls: "text-amber-500" },
} as const;

const Caption = ({ text }: { text: string }) =>
  text ? <figcaption className="mt-2 text-center text-sm text-muted-foreground">{text}</figcaption> : null;

function BlockView({ block }: { block: Block }) {
  const { theme } = useTheme();
  switch (block.type) {
    case "heading":
      return block.level === 3
        ? <h3 className="text-xl font-semibold mt-2">{block.text}</h3>
        : <h2 className="text-2xl font-bold mt-4">{block.text}</h2>;
    case "text":
      return <LessonText text={block.text} />;
    case "code": {
      const lines = block.code.split("\n").length;
      return (
        <figure>
          <div className="rounded-xl overflow-hidden border border-border">
            <CodeEditor value={block.code} language={block.language || "plaintext"}
              theme={theme === "dark" ? "vs-dark" : "light"}
              height={`${Math.min(520, Math.max(120, lines * 19 + 24))}px`} readOnly />
          </div>
          <Caption text={block.caption} />
        </figure>
      );
    }
    case "image":
      // an uploaded image in the editor's preview: the block still names the asset (public pages get a URL instead)
      if (block.assetId && !block.url) {
        return (
          <figure>
            <OwnerImage assetId={block.assetId} alt={block.caption} className="mx-auto max-w-full rounded-xl border border-border" />
            <Caption text={block.caption} />
          </figure>
        );
      }
      return isSafeUrl(block.url) ? (
        <figure>
          <img src={block.url} alt={block.caption} loading="lazy" className="mx-auto max-w-full rounded-xl border border-border" />
          <Caption text={block.caption} />
        </figure>
      ) : null;
    case "video": {
      if (!isSafeUrl(block.url)) return null;
      const embed = embedUrl(block.url);
      return (
        <figure>
          {embed ? (
            <iframe src={embed} title={block.caption || "Video"} className="w-full aspect-video rounded-xl border border-border"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
          ) : (
            <video src={block.url} controls className="w-full rounded-xl border border-border" />
          )}
          <Caption text={block.caption} />
        </figure>
      );
    }
    case "html":
      // Isolated: sandbox="" (no scripts, no same-origin, nothing), our own document with a restrictive CSP, creator markup only in <body>.
      return (
        <iframe sandbox={HTML_FRAME_SANDBOX} referrerPolicy="no-referrer" loading="lazy" srcDoc={htmlFrameDocument(block.html)} title="Embedded content"
          style={{ height: htmlFrameHeight(block.height) }} className="w-full rounded-xl border border-border bg-white" />
      );
    case "svg":
      // Rendered through <img> so scripts inside the SVG never execute.
      return (
        <figure>
          <img alt={block.caption} className="mx-auto max-w-full rounded-xl bg-white/5 p-2"
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(block.svg)}`} />
          <Caption text={block.caption} />
        </figure>
      );
    case "callout": {
      const c = CALLOUT[block.variant] ?? CALLOUT.info;
      const Icon = c.icon;
      return (
        <aside className={`rounded-xl border-l-4 p-5 flex gap-3 ${c.cls}`}>
          <Icon className={`h-5 w-5 mt-1 shrink-0 ${c.iconCls}`} />
          <div className="flex-1 min-w-0"><LessonText text={block.text} /></div>
        </aside>
      );
    }
    case "divider":
      return <hr className="border-border" />;
  }
}

export function BlockRenderer({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-8">
      {blocks.map((b) => <BlockView key={b.id} block={b} />)}
    </div>
  );
}
