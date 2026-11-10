import { motion } from "framer-motion";
import { ArrowRight, BookOpen, Code2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/QueryState";
import { useAuth } from "@/context/AuthContext";
import { useProblems, useTracks } from "@/hooks/useContent";
import { getIcon } from "@/lib/icons";

export default function Dashboard() {
  const { user } = useAuth();
  const tracksQ = useTracks();
  const problemsQ = useProblems();

  if (tracksQ.isLoading || problemsQ.isLoading) return <div className="min-h-screen pt-28"><LoadingState /></div>;
  const error = tracksQ.error ?? problemsQ.error;
  if (error) return <div className="min-h-screen pt-28"><ErrorState error={error} onRetry={() => { tracksQ.refetch(); problemsQ.refetch(); }} /></div>;

  const tracks = tracksQ.data ?? [];
  const problems = problemsQ.data ?? [];

  return (
    <div className="min-h-screen pt-28 pb-16">
      <div className="container px-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">
            Welcome back, <span className="gradient-text">{user?.name.split(" ")[0]}</span>
          </h1>
          <p className="text-muted-foreground">Pick up where you left off, or start something new.</p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10 max-w-xl">
          <Link to="/tracks" className="glass-card rounded-2xl p-5 flex items-center gap-4 hover:border-primary/30 border border-transparent transition-all">
            <div className="p-3 rounded-xl bg-primary/10"><BookOpen className="h-5 w-5 text-primary" /></div>
            <div>
              <div className="text-2xl font-bold">{tracks.length}</div>
              <div className="text-sm text-muted-foreground">Learning tracks</div>
            </div>
          </Link>
          <Link to="/practice" className="glass-card rounded-2xl p-5 flex items-center gap-4 hover:border-primary/30 border border-transparent transition-all">
            <div className="p-3 rounded-xl bg-accent/10"><Code2 className="h-5 w-5 text-accent" /></div>
            <div>
              <div className="text-2xl font-bold">{problems.length}</div>
              <div className="text-sm text-muted-foreground">Practice problems</div>
            </div>
          </Link>
        </div>

        <h2 className="text-xl font-semibold mb-4">Your tracks</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {tracks.map((track, i) => {
            const Icon = getIcon(track.icon);
            return (
              <motion.div key={track.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Link to={`/track/${track.slug}`} className="glass-card rounded-2xl p-5 flex items-center gap-4 group hover:border-primary/30 border border-transparent transition-all">
                  <div className={`p-3 rounded-xl bg-gradient-to-br ${track.color}`}><Icon className="h-5 w-5 text-white" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate group-hover:text-primary transition-colors">{track.name}</div>
                    <div className="text-xs text-muted-foreground">{track.lessonCount} lessons · ~{track.estimatedHours}h</div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </Link>
              </motion.div>
            );
          })}
        </div>

        {tracks.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">No tracks have been published yet.</p>
            <Link to="/practice"><Button variant="outline">Browse practice problems</Button></Link>
          </div>
        )}
      </div>
    </div>
  );
}
