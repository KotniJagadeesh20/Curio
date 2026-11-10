import { useState } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { User, Mail, Lock, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";

export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { signup } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signup(name, email, password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16">
      <div className="absolute inset-0 grid-pattern" />
      <div className="absolute top-1/4 -left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 -right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md"
      >
        <div className="glass-card rounded-3xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">Create account</h1>
            <p className="text-muted-foreground">
              Start your DSA mastery journey today
            </p>
          </div>


          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                required
                maxLength={120}
                placeholder="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="pl-10 h-12 bg-background"
              />
            </div>

            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="email"
                required
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 h-12 bg-background"
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="password"
                required
                minLength={8}
                maxLength={72}
                placeholder="Password (min 8 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 h-12 bg-background"
              />
            </div>

            {/* Features */}
            <div className="py-4 space-y-2">
              {[
                "Access to all learning paths",
                "Curated practice problems",
                "Interactive code editor",
                "Progress tracking",
              ].map((feature) => (
                <div
                  key={feature}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  {feature}
                </div>
              ))}
            </div>

            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-12 gradient-bg text-primary-foreground gap-2"
            >
              {submitting ? "Creating account..." : "Create account"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Already have an account?{" "}
            <Link to="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>

          <p className="text-center text-xs text-muted-foreground mt-4">
            By signing up, you agree to our{" "}
            <a href="#" className="underline">
              Terms
            </a>{" "}
            and{" "}
            <a href="#" className="underline">
              Privacy Policy
            </a>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
