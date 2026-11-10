import { useState } from "react";
import Editor from "@monaco-editor/react";
import { motion } from "framer-motion";
import { Play, RotateCcw, Copy, Check } from "lucide-react";
import { Button } from "./ui/button";
import { useTheme } from "./ThemeProvider";

interface CodeEditorProps {
  defaultCode?: string;
  value?: string;
  language?: string;
  height?: string;
  theme?: string;
  readOnly?: boolean;
  /** Executes the code and returns the output text. When omitted, Run is shown disabled. */
  onRun?: (code: string, language: string) => Promise<string> | string;
}

const extensions: Record<string, string> = {
  java: "java", javascript: "js", typescript: "ts", python: "py", bash: "sh", yaml: "yaml", rust: "rs", go: "go",
};

export function CodeEditor({
  defaultCode = "",
  value,
  language = "java",
  height = "400px",
  readOnly = false,
  onRun,
}: CodeEditorProps) {
  const { theme } = useTheme();
  const [code, setCode] = useState(value || defaultCode);
  const [copied, setCopied] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const isReadOnly = readOnly;

  const [running, setRunning] = useState(false);

  const handleRun = async () => {
    if (!onRun) return;
    setRunning(true);
    try {
      setOutput(await onRun(code, language));
    } catch (e) {
      setOutput(e instanceof Error ? e.message : "Execution failed");
    } finally {
      setRunning(false);
    }
  };

  const handleReset = () => {
    setCode(defaultCode);
    setOutput(null);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-2xl overflow-hidden"
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-rose-500" />
            <div className="w-3 h-3 rounded-full bg-amber-500" />
            <div className="w-3 h-3 rounded-full bg-emerald-500" />
          </div>
          <span className="ml-2 text-sm text-muted-foreground font-mono">
            {readOnly ? `example.${extensions[language] ?? language}` : `Solution.${extensions[language] ?? language}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-8 px-2"
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="h-8 px-2"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          {!readOnly && (
            <Button
              size="sm"
              onClick={handleRun}
              disabled={!onRun || running}
              title={onRun ? undefined : "Code execution is coming soon"}
              className="h-8 gradient-bg text-primary-foreground gap-1"
            >
              <Play className="h-4 w-4" />
              {running ? "Running..." : "Run"}
            </Button>
          )}
        </div>
      </div>

      {/* Editor */}
      <Editor
        height={height}
        language={language}
        value={code}
        onChange={(value) => setCode(value || "")}
        theme={theme === "dark" ? "vs-dark" : "light"}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          fontFamily: "JetBrains Mono, monospace",
          padding: { top: 16, bottom: 16 },
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
          readOnly: isReadOnly,
        }}
      />

      {/* Output */}
      {output && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          className="border-t border-border bg-muted/30 p-4"
        >
          <pre className="text-sm font-mono text-emerald-500 whitespace-pre-wrap">
            {output}
          </pre>
        </motion.div>
      )}
    </motion.div>
  );
}
