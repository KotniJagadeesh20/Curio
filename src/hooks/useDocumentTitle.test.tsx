import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SITE_NAME, useDocumentTitle } from "./useDocumentTitle";

afterEach(() => { document.title = ""; });

describe("useDocumentTitle", () => {
  it("sets 'title · site' while mounted and restores the previous title on unmount", () => {
    document.title = "Before";
    const { unmount } = renderHook(() => useDocumentTitle("Discover"));
    expect(document.title).toBe(`Discover · ${SITE_NAME}`);
    unmount();
    expect(document.title).toBe("Before");
  });

  it("follows title changes and uses just the site name for a missing title", () => {
    const { rerender } = renderHook(({ t }: { t: string | null }) => useDocumentTitle(t), { initialProps: { t: null as string | null } });
    expect(document.title).toBe(SITE_NAME);
    rerender({ t: "Lisbon in 3 days" });
    expect(document.title).toBe(`Lisbon in 3 days · ${SITE_NAME}`);
  });
});
