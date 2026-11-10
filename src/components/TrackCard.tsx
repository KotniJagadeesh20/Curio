import { motion } from "framer-motion";
import { ArrowRight, Clock, BookOpen } from "lucide-react";
import { Link } from "react-router-dom";
import type { TrackSummary } from "@/lib/types";
import { getIcon } from "@/lib/icons";

interface TrackCardProps {
  track: TrackSummary;
  index: number;
}

export function TrackCard({ track, index }: TrackCardProps) {
  const Icon = getIcon(track.icon);

  const difficultyColors = {
    Beginner: "text-emerald-500",
    Intermediate: "text-amber-500", 
    Advanced: "text-rose-500",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.5 }}
      whileHover={{ y: -12 }}
      className="group"
    >
      <Link to={`/track/${track.slug}`}>
        <div className="neu-card neu-card-hover p-8 h-full transition-all duration-500">
          {/* Large Hero Icon */}
          <div className="relative mb-8">
            <motion.div
              whileHover={{ rotate: -5, scale: 1.05 }}
              transition={{ type: "spring", stiffness: 300 }}
              className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${track.color} flex items-center justify-center neu-icon`}
            >
              <Icon className="h-10 w-10 text-white" />
            </motion.div>
            
            {/* Floating difficulty badge */}
            <div className={`absolute -top-2 -right-2 px-3 py-1 rounded-full text-xs font-semibold neu-inset bg-card ${difficultyColors[track.difficulty as keyof typeof difficultyColors] || "text-muted-foreground"}`}>
              {track.difficulty}
            </div>
          </div>

          {/* Content */}
          <h3 className="text-2xl font-bold mb-3 group-hover:gradient-text transition-all duration-300">
            {track.name}
          </h3>
          <p className="text-muted-foreground mb-6 line-clamp-3 leading-relaxed">
            {track.description}
          </p>

          {/* Stats Row */}
          <div className="flex items-center gap-6 mb-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="p-2 rounded-xl neu-inset">
                <BookOpen className="h-4 w-4 text-primary" />
              </div>
              <span>{track.lessonCount} lessons</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="p-2 rounded-xl neu-inset">
                <Clock className="h-4 w-4 text-accent" />
              </div>
              <span>~{track.estimatedHours}h</span>
            </div>
          </div>

          {/* CTA */}
          <div className="flex items-center justify-between pt-4 border-t border-border/50">
            <span className="text-sm font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              Start Learning
            </span>
            <motion.div
              initial={{ x: 0, opacity: 0.5 }}
              whileHover={{ x: 4 }}
              className="p-2 rounded-xl gradient-bg text-primary-foreground group-hover:opacity-100 opacity-60 transition-opacity"
            >
              <ArrowRight className="h-5 w-5" />
            </motion.div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
