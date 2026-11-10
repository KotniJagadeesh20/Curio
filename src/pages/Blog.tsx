import { motion } from "framer-motion";
import { ExternalLink, Calendar, Clock, Tag } from "lucide-react";

interface BlogPost {
  id: string;
  title: string;
  description: string;
  date: string;
  readTime: string;
  tags: string[];
  url: string;
  image?: string;
}

const blogPosts: BlogPost[] = [
  {
    id: "1",
    title: "Understanding Time Complexity: A Beginner's Guide",
    description: "Learn how to analyze algorithms and understand Big O notation with practical examples and visual explanations.",
    date: "2026-03-20",
    readTime: "8 min",
    tags: ["DSA", "Algorithms"],
    url: "https://example.com/blog/time-complexity",
  },
  {
    id: "2",
    title: "System Design: Building Scalable Chat Applications",
    description: "A deep dive into designing real-time chat systems — covering WebSockets, message queues, and database choices.",
    date: "2026-03-15",
    readTime: "12 min",
    tags: ["System Design", "Architecture"],
    url: "https://example.com/blog/scalable-chat",
  },
  {
    id: "3",
    title: "Git Branching Strategies for Teams",
    description: "Explore popular Git workflows like GitFlow, trunk-based development, and how to pick the right one for your team.",
    date: "2026-03-10",
    readTime: "6 min",
    tags: ["Git", "DevOps"],
    url: "https://example.com/blog/git-branching",
  },
  {
    id: "4",
    title: "Java Streams API: From Zero to Hero",
    description: "Master functional programming in Java with streams, lambdas, and collectors through hands-on examples.",
    date: "2026-03-05",
    readTime: "10 min",
    tags: ["Java", "Functional Programming"],
    url: "https://example.com/blog/java-streams",
  },
  {
    id: "5",
    title: "Linux Command Line Essentials for Developers",
    description: "The must-know Linux commands that every developer should have in their toolkit for productivity and debugging.",
    date: "2026-02-28",
    readTime: "7 min",
    tags: ["Linux", "Productivity"],
    url: "https://example.com/blog/linux-essentials",
  },
];

export default function Blog() {
  return (
    <div className="container mx-auto px-4 py-24 max-w-5xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-12 text-center"
      >
        <h1 className="text-4xl font-bold gradient-text mb-4">Blog</h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          Articles, tutorials, and insights on software engineering, algorithms, and system design.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {blogPosts.map((post, index) => (
          <motion.a
            key={post.id}
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08 }}
            className="group flex flex-col rounded-2xl border border-border bg-card p-6 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 aspect-square"
          >
            <div className="flex-1 flex flex-col">
              <h2 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors mb-3 line-clamp-2">
                {post.title}
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed mb-auto line-clamp-4">
                {post.description}
              </p>
            </div>
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                    <Tag className="h-3 w-3" />
                    {tag}
                  </span>
                ))}
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {new Date(post.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {post.readTime}
                </span>
                <ExternalLink className="h-4 w-4 group-hover:text-primary transition-colors" />
              </div>
            </div>
          </motion.a>
        ))}
      </div>
    </div>
  );
}
