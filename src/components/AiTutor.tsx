import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Send, X, Sparkles, User, Loader2, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface AiTutorProps {
  topicTitle: string;
  topicId: string;
}

const MOCK_RESPONSES: Record<string, string[]> = {
  default: [
    "Great question! Let me break this down for you step by step.\n\nThe key concept here is understanding how data structures work at a fundamental level. Think of it like organizing books on a shelf — the way you arrange them determines how quickly you can find what you need.\n\n**Key Points:**\n- Time complexity tells us how fast an operation runs\n- Space complexity tells us how much memory we need\n- Trade-offs between the two are common in real-world applications",
    "That's a really insightful question! Here's how I'd explain it:\n\nImagine you're building a library system. You need to store books, find them quickly, and sometimes reorganize them.\n\n```python\n# Example: Simple search vs optimized search\ndef linear_search(arr, target):  # O(n)\n    for item in arr:\n        if item == target:\n            return True\n    return False\n\ndef binary_search(arr, target):  # O(log n)\n    left, right = 0, len(arr) - 1\n    while left <= right:\n        mid = (left + right) // 2\n        if arr[mid] == target:\n            return True\n        elif arr[mid] < target:\n            left = mid + 1\n        else:\n            right = mid - 1\n    return False\n```\n\nThe second approach is much faster for large datasets!",
    "Excellent! Let me give you a practical perspective on this.\n\n**Real-world analogy:** Think of a hash map like a coat check at a restaurant. You give your coat (value) and get a ticket number (key). When you want your coat back, you just show the ticket — no searching required!\n\n**Common interview patterns:**\n1. Two-pointer technique\n2. Sliding window\n3. Hash map for O(1) lookups\n\nWould you like me to dive deeper into any of these?",
  ],
};

function getRandomResponse(): string {
  const responses = MOCK_RESPONSES.default;
  return responses[Math.floor(Math.random() * responses.length)];
}

const SUGGESTED_QUESTIONS = [
  "Explain this concept simply",
  "Give me a real-world example",
  "What are common interview questions?",
  "How does this compare to alternatives?",
];

export function AiTutor({ topicTitle, topicId }: AiTutorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Reset messages when topic changes
  useEffect(() => {
    setMessages([]);
  }, [topicId]);

  const sendMessage = async (content: string) => {
    if (!content.trim() || isTyping) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: content.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    // Simulate AI response delay
    await new Promise((r) => setTimeout(r, 1200 + Math.random() * 1000));

    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: getRandomResponse(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, assistantMsg]);
    setIsTyping(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <>
      {/* Floating trigger button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:shadow-xl transition-shadow"
          >
            <Sparkles className="h-6 w-6" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className={cn(
              "fixed z-50 flex flex-col bg-card border border-border rounded-2xl shadow-2xl overflow-hidden",
              isExpanded
                ? "inset-4 md:inset-8"
                : "bottom-6 right-6 w-[400px] h-[560px] max-h-[80vh]"
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4.5 w-4.5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold leading-tight">AI Tutor</h3>
                  <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                    Ask about {topicTitle}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setIsExpanded(!isExpanded)}
                >
                  {isExpanded ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setIsOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                    <Sparkles className="h-8 w-8 text-primary" />
                  </div>
                  <h4 className="text-base font-semibold mb-1">
                    Ask me about {topicTitle}
                  </h4>
                  <p className="text-sm text-muted-foreground mb-6">
                    I can explain concepts, give examples, and help you prepare for interviews.
                  </p>
                  <div className="grid grid-cols-1 gap-2 w-full max-w-[300px]">
                    {SUGGESTED_QUESTIONS.map((q) => (
                      <button
                        key={q}
                        onClick={() => sendMessage(q)}
                        className="text-left text-sm px-3 py-2 rounded-lg border border-border hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "flex gap-2.5",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {msg.role === "assistant" && (
                    <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="h-3.5 w-3.5 text-primary" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted/60 text-foreground rounded-bl-md"
                    )}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                  {msg.role === "user" && (
                    <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  )}
                </motion.div>
              ))}

              {isTyping && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex gap-2.5"
                >
                  <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="bg-muted/60 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Thinking...</span>
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="border-t border-border p-3 bg-muted/20">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask a question..."
                  rows={1}
                  className="flex-1 resize-none bg-background border border-border rounded-xl px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring max-h-[100px]"
                  style={{ minHeight: "40px" }}
                />
                <Button
                  size="icon"
                  className="h-10 w-10 rounded-xl shrink-0"
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || isTyping}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
                AI responses are simulated. Connect a backend for real AI.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
