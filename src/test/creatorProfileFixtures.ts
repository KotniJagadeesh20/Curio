import type { PublicCollectionSummary, PublicCreator } from "@/lib/types";

// Step 15b (plan rev. 2.1 §3.2–§4): the public creator profile `/@username`.
export const CREATOR = "GET /public/creators/alice";
export const COLLECTIONS = (page = 0) => `GET /public/collections?creator=alice&page=${page}&size=50`;

export const creator = (o: Partial<PublicCreator> = {}): PublicCreator => ({
  username: "alice", displayName: "Alice Liddell", bio: "Travel writer.\nTrams and tiles.",
  avatarUrl: "https://img.example.org/alice.png", bannerUrl: "https://img.example.org/banner.png",
  socialLinks: { GitHub: "https://github.com/alice", Blog: "https://alice.example.org" },
  joinedAt: "2026-01-15T10:00:00Z", ...o,
});

export const summary = (slug: string, category: { slug: string; name: string } | null = { slug: "travel", name: "Travel" }): PublicCollectionSummary => ({
  slug, title: `Title ${slug}`, description: "", coverUrl: null, coverThumbUrl: null,
  category, creator: { username: "alice", displayName: "Alice Liddell" }, moduleCount: 1, pageCount: 1,
});

export const paged = (items: PublicCollectionSummary[], page = 0, totalPages = 1, totalItems = items.length) =>
  ({ items, page, size: 50, totalItems, totalPages });

