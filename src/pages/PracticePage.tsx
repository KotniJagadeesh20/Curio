import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ArrowRight, ChevronDown, Filter, LayoutGrid, List, Flame, Zap, Target, BookOpen } from "lucide-react";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ErrorState, LoadingState } from "@/components/QueryState";
import { useProblems, useTracks } from "@/hooks/useContent";
import { getIcon } from "@/lib/icons";
import type { Difficulty, ProblemSummary, TrackSummary } from "@/lib/types";

type ViewMode = "tracks" | "list";

const difficultyColors: Record<Difficulty, string> = {
  easy: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  medium: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  hard: "bg-red-500/10 text-red-500 border-red-500/20",
};
const difficultyOrder: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 };
const OTHER = "__other";

export default function PracticePage() {
  const problemsQuery = useProblems();
  const tracksQuery = useTracks();
  const [search, setSearch] = useState("");
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("tracks");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const problems = problemsQuery.data;
  const tracks = tracksQuery.data;

  const trackBySlug = useMemo(() => new Map((tracks ?? []).map((t) => [t.slug, t])), [tracks]);

  const { filtered, byTrack } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = (problems ?? []).filter((p) =>
      (!q || [p.title, p.concept, p.category].some((f) => f.toLowerCase().includes(q))) &&
      (!selectedTrack || p.trackSlug === selectedTrack) &&
      (!selectedDifficulty || p.difficulty === selectedDifficulty));

    const byTrack = new Map<string, Map<string, ProblemSummary[]>>();
    for (const p of filtered) {
      const t = p.trackSlug ?? OTHER;
      const c = p.category || "General";
      if (!byTrack.has(t)) byTrack.set(t, new Map());
      const cats = byTrack.get(t)!;
      if (!cats.has(c)) cats.set(c, []);
      cats.get(c)!.push(p);
    }
    byTrack.forEach((cats) => cats.forEach((list) => list.sort((a, b) => difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty])));
    return { filtered, byTrack };
  }, [problems, search, selectedTrack, selectedDifficulty]);

  if (problemsQuery.isLoading || tracksQuery.isLoading) {
    return <div className="min-h-screen pt-28"><LoadingState label="Loading problems..." /></div>;
  }
  const error = problemsQuery.error ?? tracksQuery.error;
  if (error) {
    return <div className="min-h-screen pt-28"><ErrorState error={error} onRetry={() => { problemsQuery.refetch(); tracksQuery.refetch(); }} /></div>;
  }

  const all = problems ?? [];
  const count = (d: Difficulty) => all.filter((p) => p.difficulty === d).length;
  const tracksWithProblems = (tracks ?? []).filter((t) => all.some((p) => p.trackSlug === t.slug));
  const isOpen = (key: string) => !collapsed.has(key);
  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const statCards = [
    { label: "Total", value: all.length, icon: Target, tone: "primary" },
    { label: "Easy", value: count("easy"), icon: Zap, tone: "emerald-500" },
    { label: "Medium", value: count("medium"), icon: Flame, tone: "amber-500" },
    { label: "Hard", value: count("hard"), icon: Target, tone: "red-500" },
    { label: "Tracks", value: tracksWithProblems.length, icon: BookOpen, tone: "primary" },
  ];
  const toneClasses: Record<string, [string, string, string]> = {
    primary: ["bg-primary/10", "text-primary", ""],
    "emerald-500": ["bg-emerald-500/10", "text-emerald-500", "text-emerald-500"],
    "amber-500": ["bg-amber-500/10", "text-amber-500", "text-amber-500"],
    "red-500": ["bg-red-500/10", "text-red-500", "text-red-500"],
  };

  return (
    <div className="min-h-screen pt-28 pb-16">
      <div className="container px-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Practice <span className="gradient-text">Problems</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            Master engineering concepts through hands-on practice. Problems organized by track and concept for structured learning.
          </p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {statCards.map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className="glass-card rounded-xl p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className={cn("p-2 rounded-lg", toneClasses[tone][0])}>
                  <Icon className={cn("h-4 w-4", toneClasses[tone][1])} />
                </div>
                <span className="text-sm text-muted-foreground">{label}</span>
              </div>
              <div className={cn("text-2xl font-bold", toneClasses[tone][2])}>{value}</div>
            </div>
          ))}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="glass-card rounded-2xl p-6 mb-8">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
            <div className="relative flex-1 w-full lg:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input placeholder="Search problems, concepts..." value={search}
                onChange={(e) => setSearch(e.target.value)} className="pl-10 h-11" />
            </div>
            <div className="flex items-center gap-2">
              <Button variant={viewMode === "tracks" ? "default" : "outline"} size="sm"
                onClick={() => setViewMode("tracks")} className={viewMode === "tracks" ? "gradient-bg" : ""}>
                <LayoutGrid className="h-4 w-4 mr-2" />By Track
              </Button>
              <Button variant={viewMode === "list" ? "default" : "outline"} size="sm"
                onClick={() => setViewMode("list")} className={viewMode === "list" ? "gradient-bg" : ""}>
                <List className="h-4 w-4 mr-2" />List
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border">
            <span className="text-sm text-muted-foreground flex items-center gap-2">
              <Filter className="h-4 w-4" />Filters:
            </span>
            {(["easy", "medium", "hard"] as Difficulty[]).map((diff) => (
              <Badge key={diff} variant="outline"
                className={cn("cursor-pointer transition-all", selectedDifficulty === diff ? difficultyColors[diff] : "hover:bg-muted")}
                onClick={() => setSelectedDifficulty(selectedDifficulty === diff ? null : diff)}>
                {diff.charAt(0).toUpperCase() + diff.slice(1)}
              </Badge>
            ))}
            <div className="h-4 w-px bg-border mx-2" />
            {tracksWithProblems.map((track) => (
              <Badge key={track.id} variant="outline"
                className={cn("cursor-pointer transition-all", selectedTrack === track.slug ? "bg-primary/10 text-primary border-primary/20" : "hover:bg-muted")}
                onClick={() => setSelectedTrack(selectedTrack === track.slug ? null : track.slug)}>
                {track.name.split(" ")[0]}
              </Badge>
            ))}
            {(selectedTrack || selectedDifficulty) && (
              <Badge variant="outline"
                className="cursor-pointer hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20"
                onClick={() => { setSelectedTrack(null); setSelectedDifficulty(null); }}>
                Clear all
              </Badge>
            )}
          </div>
        </motion.div>

        <div className="mb-4 text-sm text-muted-foreground">Showing {filtered.length} problems</div>

        <AnimatePresence mode="wait">
          {viewMode === "tracks" ? (
            <motion.div key="tracks" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }} className="space-y-6">
              {[...byTrack.entries()].map(([trackSlug, categories], i) => {
                const track = trackBySlug.get(trackSlug);
                const TrackIcon = getIcon(track?.icon);
                const total = [...categories.values()].reduce((n, l) => n + l.length, 0);
                return (
                  <motion.div key={trackSlug} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }} className="glass-card rounded-2xl overflow-hidden">
                    <div className={cn("p-6 bg-gradient-to-r bg-opacity-10", track?.color ?? "from-primary to-accent")}>
                      <div className="flex items-center gap-4">
                        <div className={cn("p-3 rounded-xl bg-gradient-to-br", track?.color ?? "from-primary to-accent")}>
                          <TrackIcon className="h-6 w-6 text-white" />
                        </div>
                        <div>
                          <h2 className="text-xl font-bold">{track?.name ?? "Other"}</h2>
                          <p className="text-sm text-muted-foreground">{total} problems</p>
                        </div>
                      </div>
                    </div>
                    <div className="divide-y divide-border">
                      {[...categories.entries()].map(([category, list]) => {
                        const key = `${trackSlug}-${category}`;
                        return (
                          <Collapsible key={key} open={isOpen(key)} onOpenChange={() => toggle(key)}>
                            <CollapsibleTrigger className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                              <div className="flex items-center gap-3">
                                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isOpen(key) && "rotate-180")} />
                                <span className="font-medium">{category}</span>
                                <Badge variant="secondary" className="text-xs">{list.length}</Badge>
                              </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="px-4 pb-4 space-y-2">
                                {list.map((p) => <ProblemRow key={p.id} problem={p} />)}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        );
                      })}
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          ) : (
            <motion.div key="list" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }} className="space-y-2">
              {filtered.map((p) => <ProblemRow key={p.id} problem={p} track={p.trackSlug ? trackBySlug.get(p.trackSlug) : undefined} />)}
            </motion.div>
          )}
        </AnimatePresence>

        {filtered.length === 0 && (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <Search className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">No problems found</h3>
            <p className="text-muted-foreground">
              {all.length === 0 ? "No problems have been published yet." : "Try adjusting your search or filters"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ProblemRow({ problem, track }: { problem: ProblemSummary; track?: TrackSummary }) {
  return (
    <motion.div whileHover={{ x: 4 }}
      className="group glass-card rounded-xl p-4 flex items-center gap-4 hover:border-primary/20 border border-transparent transition-all">
      <Link to={`/problem/${problem.slug}`} className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-medium group-hover:text-primary transition-colors">{problem.title}</h3>
          {track && <Badge variant="outline" className="text-xs">{track.name.split(" ")[0]}</Badge>}
        </div>
        {(problem.category || problem.concept) && (
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground">{problem.category}</span>
            {problem.category && problem.concept && <span className="text-muted-foreground">•</span>}
            <span className="text-xs text-primary/80">{problem.concept}</span>
          </div>
        )}
      </Link>
      <Badge variant="outline" className={cn("shrink-0", difficultyColors[problem.difficulty])}>{problem.difficulty}</Badge>
      <Link to={`/problem/${problem.slug}`} aria-label={`Open ${problem.title}`}>
        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
      </Link>
    </motion.div>
  );
}
