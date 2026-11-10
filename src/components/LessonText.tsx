import { Fragment } from "react";

type Block =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] };

// Lesson text is plain text: blank-line separated paragraphs, "- " bullets and "1. " numbered items.
function parse(text: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of text.split(/\n\s*\n/)) {
    let para: string[] = [];
    const flush = () => {
      if (para.length) blocks.push({ type: "p", text: para.join(" ") });
      para = [];
    };
    for (const raw of chunk.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const bullet = line.match(/^[-•]\s+(.*)/);
      const numbered = line.match(/^\d+[.)]\s+(.*)/);
      const kind = bullet ? "ul" : numbered ? "ol" : null;
      if (!kind) {
        para.push(line);
        continue;
      }
      flush();
      const last = blocks[blocks.length - 1];
      const item = (bullet ?? numbered)![1];
      if (last && last.type === kind) last.items.push(item);
      else blocks.push({ type: kind, items: [item] });
    }
    flush();
  }
  return blocks;
}

// "Label: rest of the item" gets a bold label, which reads like a definition list.
function Item({ text }: { text: string }) {
  const m = text.match(/^([^:]{2,40}):\s+(.*)$/);
  if (!m) return <>{text}</>;
  return (
    <>
      <span className="font-semibold text-foreground">{m[1]}:</span> {m[2]}
    </>
  );
}

export function LessonText({ text }: { text: string }) {
  return (
    <div className="space-y-5 text-[1.05rem] leading-8 text-foreground/80">
      {parse(text).map((b, i) => (
        <Fragment key={i}>
          {b.type === "p" && <p>{b.text}</p>}
          {b.type === "ul" && (
            <ul className="space-y-2 pl-6 list-disc marker:text-primary">
              {b.items.map((it, j) => (
                <li key={j}><Item text={it} /></li>
              ))}
            </ul>
          )}
          {b.type === "ol" && (
            <ol className="space-y-2 pl-6 list-decimal marker:text-primary marker:font-semibold">
              {b.items.map((it, j) => (
                <li key={j}><Item text={it} /></li>
              ))}
            </ol>
          )}
        </Fragment>
      ))}
    </div>
  );
}
