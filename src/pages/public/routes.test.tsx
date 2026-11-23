// Step 14d-1: the public route adapters, moved from src/pages/creator/Placeholders.tsx with no behavior change.
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/pages/public/CollectionView", () => ({
  default: ({ username, slug }: { username: string; slug: string }) => <div data-testid="collection-view">{`${username}|${slug}`}</div>,
}));
vi.mock("@/pages/public/PageView", () => ({
  default: (p: { username: string; collectionSlug: string; moduleSlug: string; pageSlug: string }) =>
    <div data-testid="page-view">{`${p.username}|${p.collectionSlug}|${p.moduleSlug}|${p.pageSlug}`}</div>,
}));
vi.mock("@/pages/public/CreatorProfile", () => ({ default: ({ username }: { username: string }) => <div data-testid="creator-profile">{username}</div> }));
vi.mock("@/pages/NotFound", () => ({ default: () => <div data-testid="not-found" /> }));
import { PublicCollectionPage, PublicCreatorProfilePage, PublicPageViewPage } from "./routes";

const visit = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/:handle" element={<PublicCreatorProfilePage />} />
      <Route path="/:handle/:collectionSlug" element={<PublicCollectionPage />} />
      <Route path="/:handle/:collectionSlug/:moduleSlug/:pageSlug" element={<PublicPageViewPage />} />
    </Routes>
  </MemoryRouter>,
);

describe("PublicCreatorProfilePage (Step 15b)", () => {
  it("passes the lower-cased username", () => {
    visit("/@Alice");
    expect(screen.getByTestId("creator-profile")).toHaveTextContent("alice");
  });
  it.each(["/alice", "/@", "/@ab", "/@1abc", "/@al-ice"])("%s is NotFound (not an @handle)", (path) => {
    visit(path);
    expect(screen.getByTestId("not-found")).toBeInTheDocument();
    expect(screen.queryByTestId("creator-profile")).toBeNull();
  });
});

describe("PublicCollectionPage", () => {
  it("passes the lower-cased username and the slug as-is", () => {
    visit("/@Alice/Java-Notes");
    expect(screen.getByTestId("collection-view")).toHaveTextContent("alice|Java-Notes");
  });
  it.each(["/alice/java", "/@/java", "/@ab/java", "/@1abc/java", "/@al-ice/java"])("%s is NotFound (not an @handle)", (path) => {
    visit(path);
    expect(screen.getByTestId("not-found")).toBeInTheDocument();
    expect(screen.queryByTestId("collection-view")).toBeNull();
  });
});

describe("PublicPageViewPage", () => {
  it("passes the lower-cased username and the three slugs as-is", () => {
    visit("/@ALICE/java/Core/Intro");
    expect(screen.getByTestId("page-view")).toHaveTextContent("alice|java|Core|Intro");
  });
  it.each(["/alice/java/core/intro", "/@ab/java/core/intro", "/@al-ice/java/core/intro"])("%s is NotFound (not an @handle)", (path) => {
    visit(path);
    expect(screen.getByTestId("not-found")).toBeInTheDocument();
    expect(screen.queryByTestId("page-view")).toBeNull();
  });
});

describe("the move", () => {
  it("Placeholders.tsx no longer exports the public adapters", async () => {
    const placeholders = await import("@/pages/creator/Placeholders");
    expect(Object.keys(placeholders)).not.toContain("PublicCollectionPage");
    expect(Object.keys(placeholders)).not.toContain("PublicPageViewPage");
    // Step 15b (disclosed change): the profile adapter moved here too, as PublicCreatorProfilePage
    expect(Object.keys(placeholders)).not.toContain("CreatorProfilePage");
    expect(Object.keys(placeholders)).not.toContain("PublicCreatorProfilePage");
  });
});
