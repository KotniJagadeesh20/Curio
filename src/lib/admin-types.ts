// Request bodies for /api/admin/** (problems only; mirrors ContentDtos.ProblemRequest)
import type { ProblemExample } from "./types";

export interface ProblemInput {
  slug: string;
  trackSlug: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  category: string;
  concept: string;
  description: string;
  examples: ProblemExample[];
  constraints: string[];
  hints: string[];
  solution: string;
  language: string;
  starterCode: string;
  published: boolean;
}

export const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** One entry per non-empty line. */
export const toLines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
export const fromLines = (a: string[]) => a.join("\n");
