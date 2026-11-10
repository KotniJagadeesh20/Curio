import { motion } from "framer-motion";
import { 
  Network, 
  Target, 
  AlertTriangle, 
  Layers, 
  ArrowRight,
  Database,
  Server,
  Globe,
  Users
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/QueryState";
import { useProblems } from "@/hooks/useContent";
import type { ProblemSummary } from "@/lib/types";

const designComponents = [
  { icon: Database, title: "Database", description: "SQL vs NoSQL, sharding, replication" },
  { icon: Server, title: "Servers", description: "Load balancers, horizontal scaling" },
  { icon: Globe, title: "CDN", description: "Content delivery, edge caching" },
  { icon: Users, title: "Users", description: "Authentication, sessions, rate limits" },
];

const difficultyStyles: Record<string, string> = {
  easy: "bg-emerald-500/10 text-emerald-500",
  medium: "bg-amber-500/10 text-amber-500",
  hard: "bg-red-500/10 text-red-500",
};

const kindStyles = {
  HLD: { badge: "bg-blue-500/10 text-blue-500", hover: "" },
  LLD: { badge: "bg-purple-500/10 text-purple-500", hover: "border-2 border-transparent hover:border-purple-500/20" },
};

function CaseStudyCard({ study, kind, index }: { study: ProblemSummary; kind: "HLD" | "LLD"; index: number }) {
  const concepts = study.concept.split(",").map((c) => c.trim()).filter(Boolean);
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + index * 0.1 }}
      whileHover={{ y: -4 }}
    >
      <Link to={`/problem/${study.slug}`} className={`glass-card rounded-2xl p-6 group block h-full ${kindStyles[kind].hover}`}>
        <div className="flex items-start justify-between mb-4 gap-3">
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-1 rounded-full ${kindStyles[kind].badge}`}>{kind}</span>
            <h3 className="text-xl font-semibold group-hover:text-primary transition-colors">{study.title}</h3>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full shrink-0 capitalize ${difficultyStyles[study.difficulty]}`}>
            {study.difficulty}
          </span>
        </div>
        {study.excerpt && <p className="text-muted-foreground mb-4">{study.excerpt}</p>}
        <div className="flex flex-wrap gap-2">
          {concepts.map((concept) => (
            <span key={concept} className="text-xs px-2 py-1 rounded-md bg-muted text-muted-foreground">{concept}</span>
          ))}
        </div>
      </Link>
    </motion.div>
  );
}

function CaseStudySection({ title, subtitle, kind, studies, action, className }: {
  title: string; subtitle: string; kind: "HLD" | "LLD"; studies: ProblemSummary[];
  action?: React.ReactNode; className?: string;
}) {
  if (studies.length === 0 && !action) return null;
  return (
    <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className={className}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">{title}</h2>
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        </div>
        {action}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {studies.map((study, i) => <CaseStudyCard key={study.id} study={study} kind={kind} index={i} />)}
      </div>
    </motion.section>
  );
}

export default function SystemDesignPage() {
  const { data: problems = [], isLoading, error, refetch } = useProblems();
  const studies = problems.filter((p) => p.trackSlug === "system-design");
  const hld = studies.filter((p) => /high/i.test(p.category));
  const lld = studies.filter((p) => /low/i.test(p.category));
  const noCaseStudies = !isLoading && !error && hld.length + lld.length === 0;

  return (
    <div className="min-h-screen pt-28 pb-16">
      <div className="container px-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <motion.div
            whileHover={{ rotate: 5, scale: 1.1 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 mb-6 shadow-lg"
          >
            <Network className="h-10 w-10 text-white" />
          </motion.div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
            System <span className="gradient-text">Design</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Learn to design scalable, reliable, and efficient systems. 
            Master the art of building systems that handle millions of users.
          </p>
        </motion.div>

        {/* Core Components */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-16"
        >
          <h2 className="text-2xl font-bold mb-6">Core Components</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {designComponents.map((component, index) => (
              <motion.div
                key={component.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -4 }}
                className="glass-card rounded-xl p-5"
              >
                <div className="p-2 rounded-lg bg-primary/10 w-fit mb-3">
                  <component.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold mb-1">{component.title}</h3>
                <p className="text-sm text-muted-foreground">{component.description}</p>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* Design Framework */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card rounded-2xl p-8 mb-16"
        >
          <h2 className="text-2xl font-bold mb-6">Design Framework</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                  1
                </div>
                <h3 className="font-semibold">Requirements</h3>
              </div>
              <p className="text-sm text-muted-foreground pl-10">
                Clarify functional and non-functional requirements. Define scope and constraints.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                  2
                </div>
                <h3 className="font-semibold">Estimations</h3>
              </div>
              <p className="text-sm text-muted-foreground pl-10">
                Calculate traffic, storage, bandwidth. Back-of-envelope calculations.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                  3
                </div>
                <h3 className="font-semibold">High-Level Design</h3>
              </div>
              <p className="text-sm text-muted-foreground pl-10">
                Draw main components, APIs, data flow. Keep it simple initially.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                  4
                </div>
                <h3 className="font-semibold">Deep Dive</h3>
              </div>
              <p className="text-sm text-muted-foreground pl-10">
                Dive into specific components. Discuss trade-offs and optimizations.
              </p>
            </div>
          </div>
        </motion.section>

        {isLoading && <LoadingState label="Loading case studies..." />}
        {error && <ErrorState error={error} onRetry={refetch} />}
        {noCaseStudies && (
          <p className="text-center text-muted-foreground py-12">No case studies have been published yet.</p>
        )}

        <CaseStudySection
          title="High Level Design (HLD)"
          subtitle="System architecture and scalability"
          kind="HLD"
          studies={hld}
          action={
            <Link to="/track/system-design">
              <Button variant="outline" className="gap-2">
                View Full Roadmap
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          }
        />

        <CaseStudySection
          title="Low Level Design (LLD)"
          subtitle="OOP design and design patterns"
          kind="LLD"
          studies={lld}
          className="mt-12"
        />

        {/* Sample architecture (illustrative) */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-16"
        >
          <h2 className="text-2xl font-bold mb-6">Sample Architecture</h2>
          <div className="glass-card rounded-2xl p-8 flex items-center justify-center min-h-[400px] relative overflow-hidden">
            {/* Decorative background */}
            <div className="absolute inset-0 grid-pattern opacity-50" />
            
            {/* Simplified architecture diagram */}
            <div className="relative z-10 flex flex-col items-center gap-8">
              {/* Clients */}
              <div className="flex items-center gap-4">
                <div className="glass-card rounded-xl p-4 text-center">
                  <Users className="h-8 w-8 mx-auto mb-2 text-primary" />
                  <span className="text-sm">Clients</span>
                </div>
              </div>

              {/* Arrow */}
              <div className="h-8 w-px bg-border" />

              {/* Load Balancer */}
              <div className="glass-card rounded-xl p-4 text-center">
                <Layers className="h-8 w-8 mx-auto mb-2 text-accent" />
                <span className="text-sm">Load Balancer</span>
              </div>

              {/* Arrow */}
              <div className="h-8 w-px bg-border" />

              {/* Servers */}
              <div className="flex items-center gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="glass-card rounded-xl p-4 text-center">
                    <Server className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                    <span className="text-xs">Server {i}</span>
                  </div>
                ))}
              </div>

              {/* Arrow */}
              <div className="h-8 w-px bg-border" />

              {/* Database */}
              <div className="flex items-center gap-4">
                <div className="glass-card rounded-xl p-4 text-center">
                  <Database className="h-8 w-8 mx-auto mb-2 text-primary" />
                  <span className="text-sm">Primary DB</span>
                </div>
                <div className="glass-card rounded-xl p-4 text-center opacity-60">
                  <Database className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <span className="text-sm">Replica</span>
                </div>
              </div>
            </div>
          </div>
        </motion.section>
      </div>
    </div>
  );
}
