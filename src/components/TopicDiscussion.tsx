import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare,
  ThumbsUp,
  Reply,
  Send,
  ChevronDown,
  ChevronUp,
  User,
  Clock,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface DiscussionReply {
  id: string;
  author: string;
  avatar: string;
  content: string;
  timestamp: string;
  likes: number;
  liked: boolean;
}

interface DiscussionPost {
  id: string;
  author: string;
  avatar: string;
  content: string;
  timestamp: string;
  likes: number;
  liked: boolean;
  tag: "question" | "tip" | "discussion" | "solution";
  replies: DiscussionReply[];
}

const TAG_STYLES: Record<string, string> = {
  question: "bg-blue-500/10 text-blue-500 border-blue-500/30",
  tip: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  discussion: "bg-purple-500/10 text-purple-500 border-purple-500/30",
  solution: "bg-amber-500/10 text-amber-500 border-amber-500/30",
};

const MOCK_POSTS: DiscussionPost[] = [
  {
    id: "1",
    author: "Alice Chen",
    avatar: "AC",
    content:
      "Can someone explain why we use two pointers instead of a nested loop for the two-sum problem on a sorted array? I understand it's O(n) vs O(n²), but what's the intuition behind why it works?",
    timestamp: "2 hours ago",
    likes: 12,
    liked: false,
    tag: "question",
    replies: [
      {
        id: "1-1",
        author: "Bob Martinez",
        avatar: "BM",
        content:
          "Great question! The key insight is that in a sorted array, if the sum of two elements is too large, moving the right pointer left will always decrease the sum. Similarly, if the sum is too small, moving the left pointer right increases it. This guarantees you won't miss any valid pair.",
        timestamp: "1 hour ago",
        likes: 8,
        liked: false,
      },
      {
        id: "1-2",
        author: "Carol Singh",
        avatar: "CS",
        content:
          "Think of it like a search space reduction. Each pointer move eliminates an entire row or column from the possibility matrix. That's why it converges in O(n).",
        timestamp: "45 min ago",
        likes: 5,
        liked: false,
      },
    ],
  },
  {
    id: "2",
    author: "David Park",
    avatar: "DP",
    content:
      "💡 Quick tip: When dealing with subarray problems, always consider if a sliding window or prefix sum approach might work before jumping to more complex solutions. I've found that about 70% of subarray problems can be solved with one of these two patterns.",
    timestamp: "5 hours ago",
    likes: 24,
    liked: false,
    tag: "tip",
    replies: [],
  },
  {
    id: "3",
    author: "Eva Johnson",
    avatar: "EJ",
    content:
      "Just solved Kadane's algorithm after struggling with it for days. The trick that helped me: think of it as making a decision at each element — either extend the current subarray or start fresh. If the current sum becomes negative, starting fresh is always better!",
    timestamp: "1 day ago",
    likes: 18,
    liked: false,
    tag: "solution",
    replies: [
      {
        id: "3-1",
        author: "Frank Lee",
        avatar: "FL",
        content:
          "Nice explanation! Another way to think about it: maxEndingHere = max(nums[i], maxEndingHere + nums[i]). This single line captures the entire algorithm.",
        timestamp: "20 hours ago",
        likes: 6,
        liked: false,
      },
    ],
  },
];

interface TopicDiscussionProps {
  topicId: string;
}

export function TopicDiscussion({ topicId }: TopicDiscussionProps) {
  const [posts, setPosts] = useState<DiscussionPost[]>(MOCK_POSTS);
  const [newPost, setNewPost] = useState("");
  const [newTag, setNewTag] = useState<DiscussionPost["tag"]>("discussion");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [expandedPosts, setExpandedPosts] = useState<Set<string>>(new Set(["1"]));
  const [showComposer, setShowComposer] = useState(false);
  const [filterTag, setFilterTag] = useState<string | null>(null);

  const toggleExpand = (postId: string) => {
    setExpandedPosts((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  };

  const handlePost = () => {
    if (!newPost.trim()) return;
    const post: DiscussionPost = {
      id: Date.now().toString(),
      author: "You",
      avatar: "YO",
      content: newPost,
      timestamp: "Just now",
      likes: 0,
      liked: false,
      tag: newTag,
      replies: [],
    };
    setPosts([post, ...posts]);
    setNewPost("");
    setShowComposer(false);
  };

  const handleReply = (postId: string) => {
    if (!replyContent.trim()) return;
    setPosts(
      posts.map((p) =>
        p.id === postId
          ? {
              ...p,
              replies: [
                ...p.replies,
                {
                  id: `${postId}-${Date.now()}`,
                  author: "You",
                  avatar: "YO",
                  content: replyContent,
                  timestamp: "Just now",
                  likes: 0,
                  liked: false,
                },
              ],
            }
          : p
      )
    );
    setReplyContent("");
    setReplyingTo(null);
    setExpandedPosts((prev) => new Set(prev).add(postId));
  };

  const toggleLikePost = (postId: string) => {
    setPosts(
      posts.map((p) =>
        p.id === postId
          ? { ...p, liked: !p.liked, likes: p.liked ? p.likes - 1 : p.likes + 1 }
          : p
      )
    );
  };

  const toggleLikeReply = (postId: string, replyId: string) => {
    setPosts(
      posts.map((p) =>
        p.id === postId
          ? {
              ...p,
              replies: p.replies.map((r) =>
                r.id === replyId
                  ? { ...r, liked: !r.liked, likes: r.liked ? r.likes - 1 : r.likes + 1 }
                  : r
              ),
            }
          : p
      )
    );
  };

  const filtered = filterTag ? posts.filter((p) => p.tag === filterTag) : posts;

  return (
    <section className="glass-card rounded-2xl p-6 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <MessageSquare className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Discussion</h2>
            <p className="text-sm text-muted-foreground">
              {posts.length} posts · Share knowledge & ask questions
            </p>
          </div>
        </div>
        <Button
          onClick={() => setShowComposer(!showComposer)}
          className="gap-2"
          size="sm"
        >
          <MessageCircle className="h-4 w-4" />
          New Post
        </Button>
      </div>

      {/* Composer */}
      <AnimatePresence>
        {showComposer && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6 overflow-hidden"
          >
            <div className="border border-border rounded-xl p-4 bg-muted/30">
              <div className="flex gap-2 mb-3">
                {(["question", "tip", "discussion", "solution"] as const).map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setNewTag(tag)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-medium border capitalize transition-all",
                      TAG_STYLES[tag],
                      newTag === tag ? "ring-2 ring-offset-1 ring-offset-background ring-primary/30" : "opacity-60"
                    )}
                  >
                    {tag}
                  </button>
                ))}
              </div>
              <Textarea
                placeholder="Share your knowledge, ask a question, or start a discussion..."
                value={newPost}
                onChange={(e) => setNewPost(e.target.value)}
                className="mb-3 bg-background/50 min-h-[100px] resize-none"
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowComposer(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handlePost} disabled={!newPost.trim()} className="gap-2">
                  <Send className="h-3.5 w-3.5" />
                  Post
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter Tags */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setFilterTag(null)}
          className={cn(
            "px-3 py-1 rounded-full text-xs font-medium border transition-all",
            !filterTag
              ? "bg-primary/10 text-primary border-primary/30"
              : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
          )}
        >
          All
        </button>
        {(["question", "tip", "discussion", "solution"] as const).map((tag) => (
          <button
            key={tag}
            onClick={() => setFilterTag(filterTag === tag ? null : tag)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium border capitalize transition-all",
              filterTag === tag ? TAG_STYLES[tag] : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
            )}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* Posts */}
      <div className="space-y-4">
        <AnimatePresence>
          {filtered.map((post) => (
            <motion.div
              key={post.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="border border-border rounded-xl overflow-hidden"
            >
              {/* Post Content */}
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="h-9 w-9 mt-0.5">
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                      {post.avatar}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-medium text-sm">{post.author}</span>
                      <Badge
                        variant="outline"
                        className={cn("text-[10px] px-2 py-0 capitalize", TAG_STYLES[post.tag])}
                      >
                        {post.tag}
                      </Badge>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {post.timestamp}
                      </span>
                    </div>
                    <p className="text-sm text-foreground/90 whitespace-pre-line">{post.content}</p>

                    {/* Actions */}
                    <div className="flex items-center gap-4 mt-3">
                      <button
                        onClick={() => toggleLikePost(post.id)}
                        className={cn(
                          "flex items-center gap-1.5 text-xs transition-colors",
                          post.liked
                            ? "text-primary font-medium"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <ThumbsUp className={cn("h-3.5 w-3.5", post.liked && "fill-primary")} />
                        {post.likes}
                      </button>
                      <button
                        onClick={() => setReplyingTo(replyingTo === post.id ? null : post.id)}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Reply className="h-3.5 w-3.5" />
                        Reply
                      </button>
                      {post.replies.length > 0 && (
                        <button
                          onClick={() => toggleExpand(post.id)}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {expandedPosts.has(post.id) ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                          {post.replies.length} {post.replies.length === 1 ? "reply" : "replies"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Reply Composer */}
              <AnimatePresence>
                {replyingTo === post.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="px-4 pb-3 overflow-hidden"
                  >
                    <div className="flex gap-2 pl-12">
                      <Textarea
                        placeholder="Write a reply..."
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
                        className="min-h-[60px] text-sm bg-muted/30 resize-none"
                      />
                      <div className="flex flex-col gap-1">
                        <Button
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleReply(post.id)}
                          disabled={!replyContent.trim()}
                        >
                          <Send className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Replies */}
              <AnimatePresence>
                {expandedPosts.has(post.id) && post.replies.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="border-t border-border bg-muted/20 overflow-hidden"
                  >
                    <div className="p-4 pl-16 space-y-4">
                      {post.replies.map((reply) => (
                        <div key={reply.id} className="flex items-start gap-3">
                          <Avatar className="h-7 w-7 mt-0.5">
                            <AvatarFallback className="text-[10px] bg-secondary text-secondary-foreground">
                              {reply.avatar}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm">{reply.author}</span>
                              <span className="text-xs text-muted-foreground">{reply.timestamp}</span>
                            </div>
                            <p className="text-sm text-foreground/80">{reply.content}</p>
                            <button
                              onClick={() => toggleLikeReply(post.id, reply.id)}
                              className={cn(
                                "flex items-center gap-1.5 text-xs mt-2 transition-colors",
                                reply.liked
                                  ? "text-primary font-medium"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              <ThumbsUp className={cn("h-3 w-3", reply.liked && "fill-primary")} />
                              {reply.likes}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}
