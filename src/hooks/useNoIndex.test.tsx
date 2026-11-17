import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NOINDEX_ATTR, useNoIndex } from "./useNoIndex";

const ours = () => document.head.querySelectorAll(`meta[${NOINDEX_ATTR}]`);
const robots = () => [...document.head.querySelectorAll('meta[name="robots"]')].map((m) => m.getAttribute("content"));

function Consumer({ on }: { on: boolean }) { useNoIndex(on); return null; }

afterEach(() => { document.head.querySelectorAll('meta[name="robots"]').forEach((m) => m.remove()); });

describe("useNoIndex", () => {
  it("adds one noindex tag while active and removes it on unmount", () => {
    const { unmount } = render(<Consumer on />);
    expect(ours()).toHaveLength(1);
    expect(ours()[0]).toHaveAttribute("name", "robots");
    expect(ours()[0]).toHaveAttribute("content", "noindex");
    unmount();
    expect(ours()).toHaveLength(0);
  });

  it("follows the flag: off → no tag, on → tag, off again → removed", () => {
    const { rerender } = render(<Consumer on={false} />);
    expect(ours()).toHaveLength(0);
    rerender(<Consumer on />);
    expect(ours()).toHaveLength(1);
    rerender(<Consumer on={false} />);
    expect(ours()).toHaveLength(0);
  });

  it("two simultaneous consumers share one tag; it stays until the last one deactivates or unmounts", () => {
    function Two({ a, b, showB = true }: { a: boolean; b: boolean; showB?: boolean }) {
      return <><Consumer on={a} />{showB && <Consumer on={b} />}</>;
    }
    const { rerender, unmount } = render(<Two a b />);
    expect(ours()).toHaveLength(1);                 // two active consumers, one tag
    rerender(<Two a={false} b />);                  // first deactivates
    expect(ours()).toHaveLength(1);                 // still there for the second
    rerender(<Two a b />);                          // first re-activates
    expect(ours()).toHaveLength(1);
    rerender(<Two a b={false} showB={false} />);    // second unmounts
    expect(ours()).toHaveLength(1);                 // still there for the first
    rerender(<Two a={false} b={false} showB={false} />);   // last active one deactivates
    expect(ours()).toHaveLength(0);
    rerender(<Two a b />);
    unmount();                                      // both unmount together
    expect(ours()).toHaveLength(0);
  });

  it("independent component trees clean up independently", () => {
    const one = render(<Consumer on />);
    const two = render(<Consumer on />);
    expect(ours()).toHaveLength(1);
    one.unmount();
    expect(ours()).toHaveLength(1);
    two.unmount();
    expect(ours()).toHaveLength(0);
  });

  it("never touches an unrelated robots meta tag", () => {
    const existing = document.createElement("meta");
    existing.name = "robots";
    existing.content = "max-image-preview:large";
    document.head.appendChild(existing);
    const { unmount } = render(<Consumer on />);
    expect(robots()).toEqual(["max-image-preview:large", "noindex"]);
    unmount();
    expect(robots()).toEqual(["max-image-preview:large"]);
    expect(existing.isConnected).toBe(true);
  });
});
