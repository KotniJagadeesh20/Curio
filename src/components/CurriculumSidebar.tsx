import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  CheckCircle2, 
  Circle, 
  ChevronLeft, 
  ChevronDown, 
  Search,
} from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import type { TrackDetail } from "@/lib/types";
import { getIcon } from "@/lib/icons";

interface CurriculumSidebarProps {
  detail: TrackDetail;
  /** slug of the lesson currently open */
  activeLesson?: string;
  /** ids of lessons the user has completed (empty until progress tracking is wired) */
  completed?: ReadonlySet<number>;
}

export function CurriculumSidebar({
  detail,
  activeLesson,
  completed,
}: CurriculumSidebarProps) {
  const { track, sections } = detail;
  const done = completed ?? new Set<number>();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<number>>(() => {
    // Expand the section containing the active lesson, else the first one
    const active = sections.find((s) => s.lessons.some((l) => l.slug === activeLesson)) ?? sections[0];
    return new Set(active ? [active.id] : []);
  });

  const toggleSection = (sectionId: number) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  // Filter sections and lessons based on search
  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return sections;
    
    const query = searchQuery.toLowerCase();
    return sections
      .map(section => ({
        ...section,
        lessons: section.lessons.filter(lesson => 
          lesson.title.toLowerCase().includes(query)
        ),
      }))
      .filter(section => 
        section.lessons.length > 0 || 
        section.title.toLowerCase().includes(query)
      );
  }, [sections, searchQuery]);

  const totalLessons = sections.reduce((acc, s) => acc + s.lessons.length, 0);
  const completedLessons = sections.reduce((acc, s) => acc + s.lessons.filter((l) => done.has(l.id)).length, 0);
  const progressPercent = totalLessons > 0 ? (completedLessons / totalLessons) * 100 : 0;

  return (
    <motion.aside
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="w-80 shrink-0 sticky top-28 h-[calc(100vh-8rem)] overflow-hidden flex flex-col"
    >
      <div className="glass-card rounded-2xl flex flex-col h-full">
        {/* Header */}
        <div className="p-4 border-b border-border shrink-0">
          {/* Back Link & Title */}
          <div className="flex items-center gap-3 mb-4">
            <Link to="/tracks">
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-sm truncate">{track.name}</h2>
            </div>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs text-muted-foreground">Progress</span>
            <div className="flex-1">
              <Progress value={progressPercent} className="h-1.5" />
            </div>
            <span className="text-xs font-medium text-muted-foreground">
              {completedLessons}/{totalLessons} chapters
            </span>
          </div>

          {/* Search */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search topics..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 bg-muted/50 border-0"
              />
            </div>
          </div>
        </div>

        {/* Scrollable Sections */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-thin">
          {filteredSections.map((section) => {
            const isExpanded = expandedSections.has(section.id);
            const totalInSection = section.lessons.length;
            const completedInSection = section.lessons.filter((l) => done.has(l.id)).length;
            const isSectionComplete = completedInSection === totalInSection && totalInSection > 0;
            const SectionIcon = getIcon(section.icon);

            return (
              <div key={section.id} className="rounded-lg overflow-hidden">
                {/* Section Header */}
                <button
                  onClick={() => toggleSection(section.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors rounded-lg group",
                    isExpanded 
                      ? "bg-muted/80" 
                      : "hover:bg-muted/50"
                  )}
                >
                  <SectionIcon className={cn(
                    "h-4 w-4 shrink-0",
                    isSectionComplete ? "text-emerald-500" : "text-muted-foreground"
                  )} />
                  
                  <span className={cn(
                    "flex-1 text-sm font-medium truncate",
                    isExpanded ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                  )}>
                    {section.title}
                  </span>

                  <span className={cn(
                    "text-xs shrink-0",
                    isSectionComplete ? "text-emerald-500" : "text-muted-foreground"
                  )}>
                    {completedInSection}/{totalInSection}
                  </span>

                  <motion.div
                    initial={false}
                    animate={{ rotate: isExpanded ? 0 : -90 }}
                    transition={{ duration: 0.15 }}
                  >
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </motion.div>
                </button>

                {/* Lessons */}
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="pl-6 pr-2 py-1 space-y-0.5">
                        {section.lessons.map((lesson) => {
                          const isActive = activeLesson === lesson.slug;
                          const isCompleted = done.has(lesson.id);

                          return (
                            <Link
                              key={lesson.id}
                              to={`/track/${track.slug}/${lesson.slug}`}
                              className={cn(
                                "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors text-left",
                                isActive
                                  ? "bg-primary/10 text-primary"
                                  : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                              )}
                            >
                              {isCompleted ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                              ) : isActive ? (
                                <div className="h-3.5 w-3.5 rounded-full border-2 border-primary shrink-0" />
                              ) : (
                                <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                              )}
                              <span className={cn(
                                "truncate flex-1",
                                isActive && "font-medium"
                              )}>
                                {lesson.title}
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

      </div>
    </motion.aside>
  );
}
