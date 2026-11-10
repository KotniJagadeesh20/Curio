import { Link, Navigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, Lightbulb, Briefcase, Globe, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { CurriculumSidebar } from "@/components/CurriculumSidebar";
import { BlockRenderer } from "@/components/editor/BlockRenderer";
import { normalizeBlocks } from "@/lib/blocks";
import { LessonText } from "@/components/LessonText";
import { CodeEditor } from "@/components/CodeEditor";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/ThemeProvider";
import { ErrorState, LoadingState } from "@/components/QueryState";
import { useLesson, useTrack } from "@/hooks/useContent";
import { ApiError } from "@/lib/api";

function NotFound({ message, backTo }: { message: string; backTo: string }) {
  return (
    <div className="min-h-screen pt-28 pb-16 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">{message}</h1>
        <Link to={backTo}>
          <Button>Back</Button>
        </Link>
      </div>
    </div>
  );
}

export default function TopicPage() {
  const { trackId, topicId } = useParams<{ trackId: string; topicId: string }>();
  const { theme } = useTheme();

  const trackQuery = useTrack(trackId);
  const detail = trackQuery.data;

  // No lesson in the URL: open the first published lesson of the track.
  const firstLesson = detail?.sections.flatMap((s) => s.lessons)[0];
  const lessonSlug = topicId ?? firstLesson?.slug;
  const lessonQuery = useLesson(trackId, lessonSlug);

  if (trackQuery.isLoading) return <div className="min-h-screen pt-28"><LoadingState label="Loading track..." /></div>;
  if (trackQuery.error instanceof ApiError && trackQuery.error.status === 404) {
    return <NotFound message="Track not found" backTo="/tracks" />;
  }
  if (trackQuery.error) return <div className="min-h-screen pt-28"><ErrorState error={trackQuery.error} onRetry={trackQuery.refetch} /></div>;
  if (!detail) return null;

  if (!topicId && firstLesson) {
    return <Navigate to={`/track/${detail.track.slug}/${firstLesson.slug}`} replace />;
  }

  const lesson = lessonQuery.data;
  const allLessons = detail.sections.flatMap((s) => s.lessons);
  const idx = allLessons.findIndex((l) => l.slug === lessonSlug);
  const prev = idx > 0 ? allLessons[idx - 1] : undefined;
  const next = idx >= 0 ? allLessons[idx + 1] : undefined;
  const section = detail.sections.find((s) => s.lessons.some((l) => l.slug === lessonSlug));
  const blocks = lesson?.blocks ? normalizeBlocks(lesson.blocks) : null;
  const hasContent = !!lesson && (blocks?.length || lesson.concept || lesson.realWorld || lesson.codeExample ||
    lesson.commonMistakes.length || lesson.bestPractices.length || lesson.interviewRelevance);

  return (
    <div className="min-h-screen pt-28 pb-16">
      <div className="container px-4">
        <div className="flex gap-8">
          <CurriculumSidebar detail={detail} activeLesson={lessonSlug} />

          <motion.main
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-1 min-w-0"
            key={lessonSlug}
          >
            {!lessonSlug && <p className="text-muted-foreground">This track has no lessons yet.</p>}
            {lessonSlug && lessonQuery.isLoading && <LoadingState label="Loading lesson..." />}
            {lessonSlug && lessonQuery.error instanceof ApiError && lessonQuery.error.status === 404 && (
              <p className="text-muted-foreground">Lesson not found.</p>
            )}
            {lessonSlug && lessonQuery.error && !(lessonQuery.error instanceof ApiError && lessonQuery.error.status === 404) && (
              <ErrorState error={lessonQuery.error} onRetry={lessonQuery.refetch} />
            )}

            {lesson && (
              <article className="max-w-3xl">
                <nav className="text-sm text-muted-foreground mb-4 flex items-center gap-2">
                  <Link to="/tracks" className="hover:text-foreground">Tracks</Link>
                  <span>/</span>
                  <Link to={`/track/${detail.track.slug}`} className="hover:text-foreground">{detail.track.name}</Link>
                  {section && (<><span>/</span><span>{section.title}</span></>)}
                </nav>

                <header className="mb-10 pb-8 border-b border-border">
                  <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">{lesson.title}</h1>
                  {lesson.summary && <p className="text-xl text-muted-foreground leading-relaxed">{lesson.summary}</p>}
                  {lesson.duration && (
                    <div className="flex items-center gap-2 mt-4 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>{lesson.duration} read</span>
                    </div>
                  )}
                </header>

                {!hasContent && (
                  <p className="text-muted-foreground">Content for this lesson is coming soon.</p>
                )}

                {blocks ? (
                  <BlockRenderer blocks={blocks} />
                ) : (
                <div className="space-y-12">
                  {lesson.concept && (
                    <section>
                      <h2 className="text-2xl font-bold mb-4">Concept</h2>
                      <LessonText text={lesson.concept} />
                    </section>
                  )}

                  {lesson.codeExample && (
                    <section>
                      <h2 className="text-2xl font-bold mb-4">Example</h2>
                      <div className="rounded-xl overflow-hidden border border-border">
                        <CodeEditor
                          value={lesson.codeExample}
                          language={lesson.codeLanguage ?? "java"}
                          theme={theme === "dark" ? "vs-dark" : "light"}
                          height={`${Math.min(520, Math.max(160, lesson.codeExample.split("\n").length * 19 + 24))}px`}
                          readOnly
                        />
                      </div>
                    </section>
                  )}

                  {lesson.realWorld && (
                    <aside className="rounded-xl border-l-4 border-accent bg-accent/5 p-5">
                      <div className="flex items-center gap-2 mb-2 font-semibold"><Globe className="h-5 w-5 text-accent" />In the real world</div>
                      <p className="text-foreground/80 leading-7">{lesson.realWorld}</p>
                    </aside>
                  )}

                  {lesson.commonMistakes.length > 0 && (
                    <section>
                      <h2 className="text-2xl font-bold mb-4 flex items-center gap-2"><AlertTriangle className="h-6 w-6 text-destructive" />Common mistakes</h2>
                      <ul className="space-y-3">
                        {lesson.commonMistakes.map((m, i) => (
                          <li key={i} className="flex items-start gap-3 rounded-lg bg-destructive/5 border border-destructive/20 p-4 text-foreground/80">
                            <span className="text-destructive font-bold">✕</span>{m}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {lesson.bestPractices.length > 0 && (
                    <section>
                      <h2 className="text-2xl font-bold mb-4 flex items-center gap-2"><Lightbulb className="h-6 w-6 text-emerald-500" />Best practices</h2>
                      <ul className="space-y-3">
                        {lesson.bestPractices.map((p, i) => (
                          <li key={i} className="flex items-start gap-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-4 text-foreground/80">
                            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />{p}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {lesson.interviewRelevance && (
                    <aside className="rounded-xl border-l-4 border-amber-500 bg-amber-500/5 p-5">
                      <div className="flex items-center gap-2 mb-2 font-semibold"><Briefcase className="h-5 w-5 text-amber-500" />Interview angle</div>
                      <p className="text-foreground/80 leading-7">{lesson.interviewRelevance}</p>
                    </aside>
                  )}
                </div>
                )}

                <div className="mt-14 pt-6 border-t border-border grid grid-cols-2 gap-4">
                  {prev ? (
                    <Link to={`/track/${detail.track.slug}/${prev.slug}`} className="rounded-xl border border-border p-4 hover:border-primary transition-colors">
                      <div className="text-xs text-muted-foreground flex items-center gap-1"><ChevronLeft className="h-3 w-3" />Previous</div>
                      <div className="font-medium mt-1">{prev.title}</div>
                    </Link>
                  ) : <span />}
                  {next && (
                    <Link to={`/track/${detail.track.slug}/${next.slug}`} className="rounded-xl border border-border p-4 hover:border-primary transition-colors text-right">
                      <div className="text-xs text-muted-foreground flex items-center gap-1 justify-end">Next<ChevronRight className="h-3 w-3" /></div>
                      <div className="font-medium mt-1">{next.title}</div>
                    </Link>
                  )}
                </div>
              </article>
            )}
          </motion.main>
        </div>
      </div>
    </div>
  );
}
