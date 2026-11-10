import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Lightbulb,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Code,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CodeEditor } from "@/components/CodeEditor";
import { ErrorState, LoadingState } from "@/components/QueryState";
import { useProblem } from "@/hooks/useContent";
import { ApiError } from "@/lib/api";

const difficultyColors = {
  easy: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  medium: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  hard: "bg-rose-500/10 text-rose-500 border-rose-500/20",
};

export default function Problem() {
  const { problemId } = useParams();
  const { data: problem, isLoading, error, refetch } = useProblem(problemId);
  const [showHints, setShowHints] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [visibleHints, setVisibleHints] = useState<number[]>([]);

  const toggleHint = (index: number) => {
    setVisibleHints((prev) =>
      prev.includes(index)
        ? prev.filter((i) => i !== index)
        : [...prev, index]
    );
  };

  if (isLoading) return <div className="min-h-screen pt-24"><LoadingState label="Loading problem..." /></div>;
  if (error instanceof ApiError && error.status === 404) {
    return (
      <div className="min-h-screen pt-24 flex flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">Problem not found</h1>
        <Link to="/practice"><Button>Back to Problems</Button></Link>
      </div>
    );
  }
  if (error) return <div className="min-h-screen pt-24"><ErrorState error={error} onRetry={refetch} /></div>;
  if (!problem) return null;

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="container px-4">
        {/* Back button */}
        <Link to="/practice">
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Problems
          </motion.button>
        </Link>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Problem Description */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Header */}
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <h1 className="text-2xl font-bold">{problem.title}</h1>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium border ${
                    difficultyColors[problem.difficulty]
                  }`}
                >
                  {problem.difficulty.charAt(0).toUpperCase() +
                    problem.difficulty.slice(1)}
                </span>
              </div>

              <div className="prose prose-invert max-w-none">
                <p className="text-muted-foreground whitespace-pre-line">
                  {problem.description || "No description has been added for this problem yet."}
                </p>
              </div>
            </div>

            {/* Examples */}
            {problem.examples.length > 0 && (
            <div className="glass-card rounded-2xl p-6">
              <h2 className="font-semibold mb-4">Examples</h2>
              <div className="space-y-4">
                {problem.examples.map((example, index) => (
                  <div
                    key={index}
                    className="p-4 rounded-xl bg-muted/50 border border-border"
                  >
                    <div className="text-sm font-mono">
                      <div className="text-muted-foreground mb-1">
                        <span className="text-primary">Input:</span>{" "}
                        {example.input}
                      </div>
                      <div className="text-muted-foreground mb-1">
                        <span className="text-primary">Output:</span>{" "}
                        {example.output}
                      </div>
                      {example.explanation && (
                        <div className="text-muted-foreground">
                          <span className="text-primary">Explanation:</span>{" "}
                          {example.explanation}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            )}

            {/* Constraints */}
            {problem.constraints.length > 0 && (
            <div className="glass-card rounded-2xl p-6">
              <h2 className="font-semibold mb-4">Constraints</h2>
              <ul className="space-y-2">
                {problem.constraints.map((constraint, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-2 text-sm text-muted-foreground font-mono"
                  >
                    <Code className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    {constraint}
                  </li>
                ))}
              </ul>
            </div>
            )}

            {/* Hints */}
            {problem.hints.length > 0 && (
            <div className="glass-card rounded-2xl p-6">
              <button
                onClick={() => setShowHints(!showHints)}
                className="w-full flex items-center justify-between font-semibold"
              >
                <span className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-amber-500" />
                  Hints ({problem.hints.length})
                </span>
                {showHints ? (
                  <ChevronUp className="h-5 w-5" />
                ) : (
                  <ChevronDown className="h-5 w-5" />
                )}
              </button>

              <AnimatePresence>
                {showHints && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-4 space-y-2">
                      {problem.hints.map((hint, index) => (
                        <div key={index}>
                          <button
                            onClick={() => toggleHint(index)}
                            className="w-full flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-left"
                          >
                            <div className="w-6 h-6 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center text-xs font-medium flex-shrink-0">
                              {index + 1}
                            </div>
                            {visibleHints.includes(index) ? (
                              <span className="text-sm">{hint}</span>
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                Click to reveal hint
                              </span>
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            )}

            {/* Solution */}
            {problem.solution && (
            <div className="glass-card rounded-2xl p-6">
              <button
                onClick={() => setShowSolution(!showSolution)}
                className="w-full flex items-center justify-between font-semibold"
              >
                <span className="flex items-center gap-2">
                  {showSolution ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                  {showSolution ? "Hide Solution" : "Show Solution"}
                </span>
              </button>

              <AnimatePresence>
                {showSolution && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-4">
                      <pre className="p-4 rounded-xl bg-muted/50 border border-border overflow-x-auto">
                        <code className="text-sm font-mono text-foreground">
                          {problem.solution}
                        </code>
                      </pre>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            )}

                      </motion.div>

          {/* Code Editor */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="xl:sticky xl:top-28 xl:h-[calc(100vh-8rem)]"
          >
            <CodeEditor
              key={problem.slug}
              defaultCode={problem.starterCode || `// Write your ${problem.language} solution here\n`}
              language={problem.language}
              height="calc(100vh - 12rem)"
            />
          </motion.div>
        </div>
      </div>
    </div>
  );
}
