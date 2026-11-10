import { motion } from "framer-motion";
import { Sparkles, TrendingUp, BookOpen, Clock, Award } from "lucide-react";
import { Link } from "react-router-dom";
import { useTracks } from "@/hooks/useContent";
import { getIcon } from "@/lib/icons";
import { ErrorState, EmptyState, LoadingState } from "@/components/QueryState";
import { TrackCard } from "@/components/TrackCard";

export default function Tracks() {
  const { data: tracks, isLoading, error, refetch } = useTracks();

  if (isLoading) return <div className="min-h-screen pt-28"><LoadingState label="Loading tracks..." /></div>;
  if (error) return <div className="min-h-screen pt-28"><ErrorState error={error} onRetry={refetch} /></div>;
  if (!tracks?.length) return <div className="min-h-screen pt-28"><EmptyState message="No tracks have been published yet." /></div>;

  const stats = [
    { icon: TrendingUp, value: String(tracks.length), label: "Learning Tracks" },
    { icon: BookOpen, value: String(tracks.reduce((n, t) => n + t.lessonCount, 0)), label: "Lessons" },
    { icon: Clock, value: `${tracks.reduce((n, t) => n + t.estimatedHours, 0)}h`, label: "Of Content" },
  ];

  return (
    <div className="min-h-screen pt-28 pb-16">
      <div className="container px-4">
        {/* Header Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full neu-card mb-8"
          >
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Structured Learning Paths</span>
          </motion.div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
            Choose Your <span className="gradient-text">Quest</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Embark on your coding journey with carefully crafted tracks.
            Each path is designed to take you from fundamentals to mastery.
          </p>
        </motion.div>

        {/* Stats Row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-wrap justify-center gap-6 mb-16"
        >
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 + index * 0.1 }}
              className="flex items-center gap-4 px-6 py-4 neu-card"
            >
              <div className="p-3 rounded-xl gradient-bg">
                <stat.icon className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stat.value}</div>
                <div className="text-xs text-muted-foreground">{stat.label}</div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Featured Track */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-12"
        >
          <h2 className="text-sm font-semibold text-primary uppercase tracking-wider mb-6 flex items-center gap-2">
            <Award className="h-4 w-4" />
            Featured Track
          </h2>
          
          {/* Hero Featured Card */}
          {tracks.slice(0, 1).map((track) => {
            const Icon = getIcon(track.icon);
            return (
              <Link key={track.id} to={`/track/${track.slug}`} className="block">
              <motion.div whileHover={{ scale: 1.01 }}>
                <div className="neu-card neu-card-hover p-8 md:p-12 flex flex-col md:flex-row items-center gap-8">
                  <div className={`w-28 h-28 rounded-3xl bg-gradient-to-br ${track.color} flex items-center justify-center neu-icon shrink-0`}>
                    <Icon className="h-14 w-14 text-white" />
                  </div>
                  <div className="flex-1 text-center md:text-left">
                    <div className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">
                      Start here
                    </div>
                    <h3 className="text-3xl font-bold mb-3">{track.name}</h3>
                    <p className="text-muted-foreground mb-4 max-w-xl">
                      {track.description}
                    </p>
                    <div className="flex flex-wrap justify-center md:justify-start gap-4 text-sm text-muted-foreground">
                      <span className="px-3 py-1.5 rounded-lg neu-inset">{track.lessonCount} lessons</span>
                      <span className="px-3 py-1.5 rounded-lg neu-inset">~{track.estimatedHours} hours</span>
                      <span className="px-3 py-1.5 rounded-lg neu-inset">{track.difficulty}</span>
                    </div>
                  </div>
                  <div className="hidden lg:flex p-4 rounded-2xl gradient-bg text-primary-foreground">
                    <span className="font-semibold">Start Now →</span>
                  </div>
                </div>
              </motion.div>
              </Link>
            );
          })}
        </motion.div>

        {/* All Tracks Section */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-6">
            All Learning Tracks
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
            {tracks.slice(1).map((track, index) => (
              <TrackCard key={track.id} track={track} index={index} />
            ))}
          </div>
        </motion.div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="mt-20 text-center"
        >
          <div className="neu-card p-8 md:p-12 max-w-3xl mx-auto">
            <h3 className="text-2xl font-bold mb-4">
              Not sure where to start?
            </h3>
            <p className="text-muted-foreground mb-6">
              Pick the Data Structures & Algorithms track, or jump straight into practice problems.
            </p>
            <Link
              to="/practice"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl gradient-bg text-primary-foreground font-semibold"
            >
              Try Practice Problems
              <Sparkles className="h-4 w-4" />
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
