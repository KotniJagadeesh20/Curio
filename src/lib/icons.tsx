import { icons, BookOpen, type LucideIcon } from "lucide-react";

/** Backend stores icons as kebab-case lucide names (e.g. "hard-drive"). */
export function getIcon(name?: string | null): LucideIcon {
  if (!name) return BookOpen;
  const pascal = name.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
  return (icons as Record<string, LucideIcon>)[pascal] ?? BookOpen;
}
