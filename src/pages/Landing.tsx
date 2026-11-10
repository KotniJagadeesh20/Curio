import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Code2,
  Target,
  LineChart,
  BookOpen,
  CheckCircle2,
  Sparkles,
  Zap,
  Brain,
  Terminal,
  Trophy,
  Flame,
  ChevronRight,
  Play,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProblems, useTracks } from "@/hooks/useContent";
import { getIcon } from "@/lib/icons";

const fadeInUp = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 },
};

const staggerContainer = {
  animate: {
    transition: { staggerChildren: 0.08 },
  },
};

const features = [
  {
    icon: Target,
    title: "Structured Roadmaps",
    description: "Expert-designed learning paths from fundamentals to mastery across DSA, System Design, and more.",
    color: "from-primary to-accent",
  },
  {
    icon: Code2,
    title: "Interactive Editor",
    description: "Built-in Monaco editor with syntax highlighting, auto-completion, and instant feedback.",
    color: "from-primary to-accent",
  },
  {
    icon: Brain,
    title: "AI Tutor",
    description: "Get instant explanations, hints, and personalized guidance from our AI-powered tutor.",
    color: "from-primary to-accent",
  },
  {
    icon: LineChart,
    title: "Track Progress",
    description: "Detailed analytics, streak tracking, and weekly goals to keep you motivated.",
    color: "from-primary to-accent",
  },
  {
    icon: BookOpen,
    title: "Curated Problems",
    description: "Hand-picked problems from real interviews at top tech companies, categorized by difficulty.",
    color: "from-primary to-accent",
  },
  {
    icon: Terminal,
    title: "Multi-Track Learning",
    description: "Java, System Design, Git, Linux, DevOps, Cloud — all in one platform.",
    color: "from-primary to-accent",
  },
];

const steps = [
  {
    step: "01",
    title: "Pick Your Quest",
    description: "Choose from curated tracks — Java, System Design, DSA, Git, and more.",
    icon: Target,
  },
  {
    step: "02",
    title: "Learn & Practice",
    description: "Deep-dive into concepts with interactive lessons, code editor, and AI tutor.",
    icon: Code2,
  },
  {
    step: "03",
    title: "Master & Level Up",
    description: "Track progress, earn badges, complete challenges, and ace your interviews.",
    icon: Trophy,
  },
];

const testimonials = [
  {
    name: "Sarah Chen",
    role: "SWE at Google",
    content: "AlgoQuest's structured approach helped me crack my Google interview. The roadmap is incredibly well-designed.",
    avatar: "S",
    rating: 5,
  },
  {
    name: "James Wilson",
    role: "SDE at Amazon",
    content: "The interactive editor and curated problems made my preparation so much more efficient. Highly recommended!",
    avatar: "J",
    rating: 5,
  },
  {
    name: "Priya Sharma",
    role: "Engineer at Meta",
    content: "I went from struggling with basic arrays to confidently solving DP problems. This platform is a game-changer.",
    avatar: "P",
    rating: 5,
  },
];

export default function Landing() {
  const { data: tracks = [] } = useTracks();
  const { data: problems = [] } = useProblems();
  const stats = [
    { value: String(problems.length), label: "Problems", icon: Code2 },
    { value: String(tracks.length), label: "Tracks", icon: Target },
    { value: String(tracks.reduce((n, t) => n + t.lessonCount, 0)), label: "Lessons", icon: Star },
    { value: `${tracks.reduce((n, t) => n + t.estimatedHours, 0)}h`, label: "Of Content", icon: Trophy },
  ];
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Animated background orbs */}
        <div className="absolute inset-0 overflow-hidden">
          <motion.div
            animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-20 left-[10%] w-72 h-72 bg-primary/15 rounded-full blur-3xl"
          />
          <motion.div
            animate={{ x: [0, -20, 0], y: [0, 30, 0] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
            className="absolute bottom-20 right-[10%] w-96 h-96 bg-accent/10 rounded-full blur-3xl"
          />
          <motion.div
            animate={{ x: [0, 15, 0], y: [0, 15, 0] }}
            transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl"
          />
        </div>

        <div className="container relative z-10 px-4 pt-28 pb-16">
          <motion.div
            initial="initial"
            animate="animate"
            variants={staggerContainer}
            className="max-w-5xl mx-auto"
          >
            {/* Top badge */}
            <motion.div variants={fadeInUp} className="flex justify-center mb-8">
              <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full neu-card text-sm">
                <Flame className="h-4 w-4 text-primary" />
                <span className="font-medium">Your coding journey starts here</span>
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
              </div>
            </motion.div>

            {/* Main heading */}
            <motion.h1
              variants={fadeInUp}
              className="text-center text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 text-balance leading-[1.1]"
            >
              Level Up Your{" "}
              <span className="gradient-text">Engineering</span>
              <br />
              Skills with{" "}
              <span className="gradient-text">AlgoQuest</span>
            </motion.h1>

            {/* Subheading */}
            <motion.p
              variants={fadeInUp}
              className="text-center text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed"
            >
              Master DSA, System Design, Java, DevOps and more with structured roadmaps, 
              interactive practice, and an AI tutor by your side.
            </motion.p>

            {/* CTA */}
            <motion.div
              variants={fadeInUp}
              className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
            >
              <Link to="/tracks">
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Button size="lg" className="gradient-bg text-primary-foreground h-14 px-10 text-base gap-2 glow-primary rounded-2xl font-semibold">
                    <Play className="h-4 w-4" />
                    Start Learning Free
                  </Button>
                </motion.div>
              </Link>
              <Link to="/practice">
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Button variant="outline" size="lg" className="h-14 px-10 text-base rounded-2xl neu-card border-0 font-semibold">
                    Explore Problems
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </motion.div>
              </Link>
            </motion.div>

            {/* Stats row - neumorphic */}
            <motion.div
              variants={fadeInUp}
              className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto"
            >
              {stats.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5 + i * 0.1 }}
                  className="neu-card p-5 text-center"
                >
                  <stat.icon className="h-5 w-5 text-primary mx-auto mb-2" />
                  <div className="text-2xl md:text-3xl font-bold gradient-text">{stat.value}</div>
                  <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-6 h-10 rounded-full border-2 border-muted-foreground/30 flex items-start justify-center p-2"
          >
            <motion.div className="w-1 h-2 rounded-full bg-primary" />
          </motion.div>
        </motion.div>
      </section>

      {/* Popular Tracks Preview */}
      <section className="py-24 relative">
        <div className="container px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full neu-card mb-6 text-sm">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="font-medium">Popular Quests</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Choose Your <span className="gradient-text">Path</span>
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Explore structured tracks designed to take you from beginner to expert.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
            {tracks.slice(0, 4).map((track, index) => {
              const Icon = getIcon(track.icon);
              return (
                <motion.div
                  key={track.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Link to={`/track/${track.slug}`}>
                    <motion.div
                      whileHover={{ y: -6 }}
                      className="neu-card neu-card-hover p-6 h-full cursor-pointer"
                    >
                      <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${track.color} flex items-center justify-center mb-4 neu-icon`}>
                        <Icon className="h-7 w-7 text-white" />
                      </div>
                      <h3 className="font-bold text-lg mb-2">{track.name}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{track.description}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="px-2 py-1 rounded-lg neu-inset">{track.lessonCount} lessons</span>
                        <span className="px-2 py-1 rounded-lg neu-inset">~{track.estimatedHours}h</span>
                      </div>
                    </motion.div>
                  </Link>
                </motion.div>
              );
            })}
          </div>

          <div className="text-center">
            <Link to="/tracks">
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="inline-block">
                <Button variant="outline" className="rounded-xl neu-card border-0 gap-2 px-6">
                  View All Tracks
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </motion.div>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 relative bg-muted/20">
        <div className="container px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Everything You Need to <span className="gradient-text">Succeed</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              A complete platform built for serious learners and aspiring engineers.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.08 }}
              >
                <motion.div
                  whileHover={{ y: -4 }}
                  className="neu-card neu-card-hover p-7 h-full"
                >
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-5`}>
                    <feature.icon className="h-6 w-6 text-primary-foreground" />
                  </div>
                  <h3 className="text-lg font-bold mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </motion.div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 relative">
        <div className="container px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              How <span className="gradient-text">AlgoQuest</span> Works
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Three simple steps to transform your engineering career.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {steps.map((item, index) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.15 }}
                className="relative"
              >
                <div className="neu-card p-8 h-full text-center relative overflow-hidden">
                  <span className="absolute top-3 right-4 text-6xl font-black text-primary/8">
                    {item.step}
                  </span>
                  <div className="w-16 h-16 rounded-2xl gradient-bg flex items-center justify-center mx-auto mb-6 neu-icon">
                    <item.icon className="h-8 w-8 text-primary-foreground" />
                  </div>
                  <h3 className="text-xl font-bold mb-3">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                </div>
                {index < 2 && (
                  <div className="hidden md:block absolute top-1/2 -right-4 transform -translate-y-1/2 z-10">
                    <ChevronRight className="h-6 w-6 text-primary/40" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 relative bg-muted/20">
        <div className="container px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Success <span className="gradient-text">Stories</span>
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Hear from developers who leveled up their careers with AlgoQuest.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {testimonials.map((t, index) => (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <motion.div whileHover={{ y: -4 }} className="neu-card neu-card-hover p-7 h-full">
                  <div className="flex gap-1 mb-4">
                    {Array.from({ length: t.rating }).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-primary text-primary" />
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground mb-6 leading-relaxed">"{t.content}"</p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full gradient-bg flex items-center justify-center text-primary-foreground font-bold text-sm">
                      {t.avatar}
                    </div>
                    <div>
                      <div className="font-semibold text-sm">{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.role}</div>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 relative">
        <div className="container px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
          >
            <div className="neu-card p-12 md:p-16 text-center relative overflow-hidden max-w-4xl mx-auto">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-accent/5" />
              <div className="relative z-10">
                <motion.div
                  whileHover={{ scale: 1.05, rotate: 5 }}
                  className="w-16 h-16 rounded-2xl gradient-bg flex items-center justify-center mx-auto mb-6 neu-icon"
                >
                  <Zap className="h-8 w-8 text-primary-foreground" />
                </motion.div>
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  Ready to Begin Your <span className="gradient-text">Quest</span>?
                </h2>
                <p className="text-muted-foreground max-w-xl mx-auto mb-8 leading-relaxed">
                  Join thousands of developers mastering engineering skills with structured learning paths. Start for free today.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Link to="/signup">
                    <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                      <Button size="lg" className="gradient-bg text-primary-foreground h-14 px-10 text-base gap-2 glow-primary rounded-2xl font-semibold">
                        Get Started Free
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </motion.div>
                  </Link>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    No credit card required
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
