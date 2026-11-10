import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Mail, ArrowRight, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      setSubmitted(true);
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
          {!submitted ? (
            <>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to login
              </Link>

              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold mb-2">Forgot password?</h1>
                <p className="text-muted-foreground">
                  No worries, we'll send you reset instructions.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 h-12 bg-background"
                    required
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 gradient-bg text-primary-foreground gap-2"
                >
                  Reset password
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </form>

              <p className="text-center text-sm text-muted-foreground mt-6">
                Remember your password?{" "}
                <Link to="/login" className="text-primary hover:underline">
                  Sign in
                </Link>
              </p>
            </>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-6"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", bounce: 0.5, delay: 0.1 }}
                className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 mb-6"
              >
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              </motion.div>

              <h2 className="text-2xl font-bold mb-2">Check your email</h2>
              <p className="text-muted-foreground mb-6">
                We sent a password reset link to
                <br />
                <span className="font-medium text-foreground">{email}</span>
              </p>

              <Button
                variant="outline"
                onClick={() => setSubmitted(false)}
                className="mb-4"
              >
                Didn't receive the email? Click to resend
              </Button>

              <p className="text-sm text-muted-foreground">
                <Link to="/login" className="text-primary hover:underline">
                  Back to login
                </Link>
              </p>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
