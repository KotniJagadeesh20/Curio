import { useState } from "react";
import { motion } from "framer-motion";
import { 
  User, 
  Mail, 
  Calendar, 
  Plus, 
  X, 
  Check,
  Clock,
  ArrowLeft
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

interface WeeklyTask {
  id: string;
  text: string;
  completed: boolean;
  priority: "low" | "medium" | "high";
}

export default function Profile() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<WeeklyTask[]>([]);
  const [newTask, setNewTask] = useState("");
  const [isAddingTask, setIsAddingTask] = useState(false);

  // ProtectedRoute guarantees a user; this narrows the type for the code below.
  if (!user) return null;

  const completedTasks = tasks.filter((t) => t.completed).length;
  const progress = tasks.length ? (completedTasks / tasks.length) * 100 : 0;

  const addTask = () => {
    if (newTask.trim()) {
      setTasks([
        ...tasks,
        {
          id: Date.now().toString(),
          text: newTask,
          completed: false,
          priority: "medium",
        },
      ]);
      setNewTask("");
      setIsAddingTask(false);
    }
  };

  const toggleTask = (id: string) => {
    setTasks(
      tasks.map((t) =>
        t.id === id ? { ...t, completed: !t.completed } : t
      )
    );
  };

  const removeTask = (id: string) => {
    setTasks(tasks.filter((t) => t.id !== id));
  };

  const priorityColors = {
    high: "bg-red-500/10 text-red-500 border-red-500/20",
    medium: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    low: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  };

  return (
    <div className="min-h-screen pt-28 pb-16">
      <div className="container px-4 max-w-4xl">
        {/* Back Link */}
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        {/* Profile Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-2xl p-8 mb-8"
        >
          <div className="flex flex-col md:flex-row items-center gap-6">
            <motion.div
              whileHover={{ scale: 1.05 }}
              className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-3xl font-bold text-white"
            >
              {user.name.charAt(0).toUpperCase()}
            </motion.div>

            <div className="text-center md:text-left flex-1">
              <h1 className="text-3xl font-bold mb-1">{user.name}</h1>
              <p className="text-muted-foreground flex items-center gap-2 justify-center md:justify-start">
                <Mail className="h-4 w-4" />
                {user.email}
              </p>
              <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1 justify-center md:justify-start">
                <Calendar className="h-4 w-4" />
                Joined {new Date(user.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
              </p>
            </div>

          </div>
        </motion.div>

        {/* Weekly To-Do List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card rounded-2xl p-8"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Clock className="h-6 w-6 text-primary" />
                Weekly Goals
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {completedTasks} of {tasks.length} tasks completed
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold gradient-text">
                {Math.round(progress)}%
              </div>
              <Progress value={progress} className="w-24 h-2 mt-1" />
            </div>
          </div>

          {/* Tasks List */}
          <div className="space-y-3 mb-6">
            {tasks.map((task, index) => (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className={cn(
                  "flex items-center gap-4 p-4 rounded-xl border transition-all",
                  task.completed
                    ? "bg-muted/30 border-muted"
                    : "bg-card border-border hover:border-primary/30"
                )}
              >
                <button
                  onClick={() => toggleTask(task.id)}
                  className={cn(
                    "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                    task.completed
                      ? "bg-emerald-500 border-emerald-500"
                      : "border-muted-foreground/30 hover:border-primary"
                  )}
                >
                  {task.completed && <Check className="h-4 w-4 text-white" />}
                </button>

                <span
                  className={cn(
                    "flex-1 font-medium",
                    task.completed && "line-through text-muted-foreground"
                  )}
                >
                  {task.text}
                </span>

                <Badge
                  variant="outline"
                  className={cn("text-xs", priorityColors[task.priority])}
                >
                  {task.priority}
                </Badge>

                <button
                  onClick={() => removeTask(task.id)}
                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            ))}
          </div>

          {/* Add Task */}
          {isAddingTask ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="flex gap-2"
            >
              <Input
                placeholder="Enter new task..."
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTask()}
                autoFocus
                className="flex-1"
              />
              <Button onClick={addTask} className="gradient-bg">
                Add
              </Button>
              <Button variant="outline" onClick={() => setIsAddingTask(false)}>
                Cancel
              </Button>
            </motion.div>
          ) : (
            <Button
              variant="outline"
              onClick={() => setIsAddingTask(true)}
              className="w-full gap-2 border-dashed"
            >
              <Plus className="h-4 w-4" />
              Add new task
            </Button>
          )}
        </motion.div>

        {/* Quick Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8"
        >
          {[
            { label: "This Week", value: "8", sublabel: "problems", color: "text-primary" },
            { label: "Focus Time", value: "12h", sublabel: "logged", color: "text-amber-500" },
            { label: "Best Topic", value: "Arrays", sublabel: "85% accuracy", color: "text-emerald-500" },
            { label: "Next Goal", value: "50", sublabel: "problems", color: "text-blue-500" },
          ].map((stat, index) => (
            <motion.div
              key={stat.label}
              whileHover={{ y: -4 }}
              className="glass-card rounded-xl p-4 text-center"
            >
              <div className={cn("text-2xl font-bold", stat.color)}>{stat.value}</div>
              <div className="text-sm font-medium">{stat.label}</div>
              <div className="text-xs text-muted-foreground">{stat.sublabel}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
