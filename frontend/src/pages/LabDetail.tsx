import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink, Github, Zap, AlertTriangle, RefreshCw, Info, RotateCcw, List, PlayCircle } from "lucide-react";
import { labsApi } from "../lib/api";
import { SolutionExecutionView } from "../components/SolutionExecutionView";
import { SolutionStepList } from "../components/SolutionStepList";
import { StatusBadge } from "../components/StatusBadge";
import { CATEGORY_CONFIG } from "../components/CategoryChip";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "../components/ui/Tooltip";
import { Category, ExerciseClassification, Question, Solution, SolveStatusDetail } from "../types";

const TABS = ["overview", "solution"] as const;

export function LabDetail() {
  const { slug } = useParams<{ slug: string }>();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"overview" | "solution">("overview");
  const [ghResult, setGhResult] = useState<{ pr_url?: string; message?: string } | null>(null);
  const [pinModal, setPinModal] = useState(false);
  const [pinValue, setPinValue] = useState("");
  const [pinError, setPinError] = useState("");

  const isSolving = (status: string | undefined) => status === "solving";

  const { data: lab, isLoading } = useQuery({
    queryKey: ["lab", slug],
    queryFn: () => labsApi.get(slug!),
    enabled: !!slug,
    // Poll every 2s while solving so UI updates automatically when backend finishes
    refetchInterval: (query) => {
      const status = query.state.data?.solution_status;
      return status === "solving" ? 2000 : false;
    },
  });

  // Re-solve mutation (force=true only — used for manual re-generation)
  const resolveMutation = useMutation({
    mutationFn: (pin: string) => labsApi.solve(slug!, false, true, pin),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lab", slug] });
      qc.invalidateQueries({ queryKey: ["labs"] });
      setPinModal(false);
      setPinValue("");
      setPinError("");
      setTab("solution");
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setPinError(status === 403 ? "Incorrect PIN" : "Something went wrong");
    },
  });

  function handleReforgeClick() {
    setPinError("");
    setPinValue("");
    setPinModal(true);
  }

  function handlePinSubmit() {
    resolveMutation.mutate(pinValue);
  }

  const pushMutation = useMutation({
    mutationFn: () => labsApi.pushGitHub(slug!),
    onSuccess: setGhResult,
  });

  // Switch to solution tab automatically when solve completes
  useEffect(() => {
    if (lab?.solution_status === "solved" && tab === "overview") {
      setTab("solution");
    }
  }, [lab?.solution_status]);

  if (isLoading) return <PageLoading />;
  if (!lab) return (
    <div style={{ paddingTop: "100px", textAlign: "center" }} className="font-mono">
      <span style={{ color: "var(--text-2)", fontSize: "13px" }}>Lab not found</span>
    </div>
  );

  const displayTopic = (lab.ai_topic || lab.category) as Category;
  const cfg = CATEGORY_CONFIG[displayTopic] ?? CATEGORY_CONFIG[lab.category as Category] ?? CATEGORY_CONFIG.linux;
  const solution = lab.solution;
  const isSolved = lab.solution_status === "solved";
  const solving = isSolving(lab.solution_status);

  return (
    <TooltipProvider>
      <div style={{ minHeight: "100vh", background: "var(--bg)", paddingTop: "52px" }}>
        <div className="lab-page-pad" style={{ maxWidth: tab === "solution" ? "1400px" : "900px", margin: "0 auto", padding: "36px 40px 64px", transition: "max-width 0.25s ease" }}>

          {/* Breadcrumb */}
          <div className="font-mono" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "var(--text-3)", marginBottom: "24px" }}>
            <Link to="/" style={{ color: "var(--text-3)", textDecoration: "none", transition: "color 0.15s" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-2)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-3)"; }}>
              Dashboard
            </Link>
            <span>/</span>
            <span style={{ color: cfg.text }}>{lab.category}</span>
            <span>/</span>
            <span style={{ color: "var(--text-2)" }}>{lab.slug}</span>
          </div>

          {/* Lab header card */}
          <div style={{
            background: "var(--surface)", border: `1px solid ${cfg.border}`,
            borderRadius: "12px", padding: "24px 28px", marginBottom: "24px",
            position: "relative", overflow: "hidden",
          }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", background: `linear-gradient(90deg, transparent, ${cfg.primary}60, transparent)` }} />
            <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: "3px", background: cfg.primary, borderRadius: "12px 0 0 12px" }} />

            <div className="lab-header-row" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Category chips */}
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "10px" }}>
                  <div className="font-mono" style={{
                    display: "inline-flex", alignItems: "center", gap: "6px",
                    fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                    padding: "3px 9px", borderRadius: "4px",
                    background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.text,
                  }}>
                    <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: cfg.primary, display: "inline-block" }} />
                    {displayTopic} · {lab.subcategory}
                  </div>
                  {lab.is_dynamic && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="font-mono" style={{
                          display: "inline-flex", alignItems: "center", gap: "4px",
                          fontSize: "9px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                          padding: "3px 8px", borderRadius: "4px",
                          background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.28)", color: "#fbbf24",
                        }}>
                          <Zap size={9} />
                          dynamic
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>Content was or will be dynamically generated</TooltipContent>
                    </Tooltip>
                  )}
                  {solution && <ClassificationBadge classification={solution.exercise_classification} reason={solution.classification_reason} />}
                </div>

                {/* Title */}
                <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text)", marginBottom: "4px", letterSpacing: "-0.01em" }}>
                  {lab.title}
                </h1>
                {lab.page_title && lab.page_title !== lab.title && (
                  <p className="font-mono" style={{ fontSize: "11px", color: "var(--text-3)", marginBottom: "4px" }}>
                    Source: {lab.page_title}
                  </p>
                )}

                {/* Solving indicator */}
                {solving && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }}>
                    <motion.span
                      style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#fbbf24" }}
                      animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }}
                    />
                    <span className="font-mono" style={{ fontSize: "11px", color: "#fbbf24" }}>
                      AI is generating solution…
                    </span>
                  </div>
                )}

                {solution?.summary && (
                  <p style={{ fontSize: "13px", color: "var(--text-2)", lineHeight: 1.65, marginTop: "6px" }}>
                    {solution.summary}
                  </p>
                )}

                {/* Pipeline metadata */}
                {solution && (solution.content_was_generated || solution.solve_status_detail) && (
                  <div style={{ display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" }}>
                    {solution.content_was_generated && (
                      <span className="font-mono" style={{ fontSize: "10px", color: "#fbbf24", display: "flex", alignItems: "center", gap: "4px" }}>
                        <Zap size={9} /> generated content used
                      </span>
                    )}
                    <SolveStatusPill detail={solution.solve_status_detail} />
                  </div>
                )}
              </div>

              <div className="lab-header-meta" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <StatusBadge status={lab.solution_status} />
                {isSolved && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <motion.button
                        onClick={handleReforgeClick}
                        disabled={resolveMutation.isPending}
                        whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                        className="font-mono"
                        style={{
                          display: "flex", alignItems: "center", gap: "5px",
                          padding: "6px 12px", fontSize: "11px", fontWeight: 500,
                          background: "var(--surface-2)", border: "1px solid var(--border)",
                          borderRadius: "6px", color: "var(--text-3)", cursor: "pointer",
                          opacity: resolveMutation.isPending ? 0.5 : 1,
                        }}
                      >
                        <RefreshCw size={11} />
                        {resolveMutation.isPending ? "Reforging…" : "Reforge"}
                      </motion.button>
                    </TooltipTrigger>
                    <TooltipContent>Discard the current solution and reforge it from scratch with AI</TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a href={lab.url} target="_blank" rel="noreferrer" style={{
                      display: "flex", alignItems: "center", padding: "7px",
                      background: "var(--surface-2)", border: "1px solid var(--border)",
                      borderRadius: "6px", color: "var(--text-2)", textDecoration: "none",
                      transition: "border-color 0.15s, color 0.15s",
                    }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border-2)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-2)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
                    >
                      <ExternalLink size={14} />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent>Open source lab: {lab.url}</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>

          {/* Tab bar */}
          <div style={{ display: "flex", gap: "2px", borderBottom: "1px solid var(--border)", marginBottom: "28px" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className="font-mono"
                style={{
                  padding: "9px 16px", fontSize: "12px", fontWeight: 500,
                  background: "none", border: "none", cursor: "pointer",
                  color: tab === t ? cfg.text : "var(--text-3)",
                  position: "relative", transition: "color 0.15s", textTransform: "capitalize",
                }}
                onMouseEnter={(e) => { if (tab !== t) e.currentTarget.style.color = "var(--text-2)"; }}
                onMouseLeave={(e) => { if (tab !== t) e.currentTarget.style.color = "var(--text-3)"; }}
              >
                {t}
                {t === "solution" && isSolved && (
                  <span style={{ display: "inline-block", width: "5px", height: "5px", borderRadius: "50%", background: "#34d399", marginLeft: "6px", verticalAlign: "middle" }} />
                )}
                {t === "solution" && solving && (
                  <motion.span
                    style={{ display: "inline-block", width: "5px", height: "5px", borderRadius: "50%", background: "#fbbf24", marginLeft: "6px", verticalAlign: "middle" }}
                    animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }}
                  />
                )}
                {tab === t && (
                  <motion.div layoutId="tab-line"
                    style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "2px", background: cfg.primary, borderRadius: "2px 2px 0 0" }}
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {/* ── Overview ── */}
            {tab === "overview" && (
              <motion.div key="overview" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>

                {/* Full scraped content from source site — rendered as markdown */}
                {lab.content && (
                  <div style={{ marginBottom: "24px" }}>
                    <div className="font-mono" style={{ fontSize: "10px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.2em", marginBottom: "10px" }}>
                      Lab Content
                    </div>
                    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "10px", padding: "20px 24px" }}>
                      <LabMarkdown content={lab.content} />
                    </div>
                  </div>
                )}

                {/* AI Overview */}
                {solution?.summary && (
                  <div style={{ marginBottom: "24px" }}>
                    <div className="font-mono" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "10px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.2em", marginBottom: "10px" }}>
                      <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: cfg.primary, display: "inline-block" }} />
                      AI Overview
                    </div>
                    <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: "10px", padding: "18px 22px" }}>
                      <p style={{ fontSize: "13px", color: "var(--text-2)", lineHeight: 1.7, margin: 0 }}>
                        {solution.summary}
                      </p>
                    </div>
                  </div>
                )}

                {/* Solving in progress banner */}
                {solving && (
                  <div style={{ marginBottom: "24px", padding: "16px 20px", borderRadius: "10px", background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.22)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <motion.div
                        style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid #fbbf24", borderTopColor: "transparent" }}
                        animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                      />
                      <span className="font-mono" style={{ fontSize: "12px", color: "#fbbf24", fontWeight: 600 }}>
                        Generating solution with AI…
                      </span>
                    </div>
                    <p className="font-mono" style={{ fontSize: "11px", color: "var(--text-3)", margin: "8px 0 0 24px" }}>
                      This happens automatically. The Solution tab will appear when ready.
                    </p>
                  </div>
                )}

                {/* Controls: Push to GitHub + Re-solve (only when solved) */}
                {isSolved && (
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <motion.button onClick={() => pushMutation.mutate()} disabled={pushMutation.isPending}
                          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                          className="font-mono"
                          style={{
                            display: "flex", alignItems: "center", gap: "7px",
                            padding: "8px 16px", fontSize: "11px", fontWeight: 500,
                            background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.28)",
                            borderRadius: "7px", color: "#60a5fa", cursor: "pointer",
                            opacity: pushMutation.isPending ? 0.6 : 1,
                          }}
                        >
                          <Github size={13} />
                          {pushMutation.isPending ? "Pushing…" : "Push to GitHub"}
                        </motion.button>
                      </TooltipTrigger>
                      <TooltipContent>Create a PR with this solution</TooltipContent>
                    </Tooltip>

                    <motion.button onClick={() => setTab("solution")} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                      className="font-mono"
                      style={{
                        display: "flex", alignItems: "center", gap: "7px",
                        padding: "8px 16px", fontSize: "11px", fontWeight: 500,
                        background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.28)",
                        borderRadius: "7px", color: "#34d399", cursor: "pointer",
                      }}
                    >
                      <RotateCcw size={11} /> View Solution
                    </motion.button>

                    <AnimatePresence>
                      {ghResult && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className="font-mono"
                          style={{ fontSize: "12px", color: ghResult.pr_url ? "#34d399" : "var(--text-2)" }}
                        >
                          {ghResult.pr_url
                            ? <a href={ghResult.pr_url} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>PR: {ghResult.pr_url}</a>
                            : ghResult.message}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── Solution ── */}
            {tab === "solution" && (
              <motion.div key="solution" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                {solution && isSolved ? (
                  <SolutionPanel solution={solution} cfg={cfg} questions={lab.questions} />
                ) : solving ? (
                  <SolvingPlaceholder cfg={cfg} solveLog={solution?.solve_log} />
                ) : (
                  <div style={{ textAlign: "center", padding: "64px 0", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px" }}>
                    <p className="font-mono" style={{ fontSize: "13px", color: "var(--text-2)" }}>No solution yet</p>
                    <p className="font-mono" style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "6px" }}>
                      The backend will solve this automatically on startup.
                    </p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* PIN modal */}
      <AnimatePresence>
        {pinModal && (
          <motion.div
            key="pin-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: "fixed", inset: 0, zIndex: 100,
              background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
            onClick={(e) => { if (e.target === e.currentTarget) { setPinModal(false); setPinError(""); } }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              style={{
                background: "var(--surface)", border: "1px solid var(--border-2)",
                borderRadius: 12, padding: "28px 28px 24px", width: 320,
                boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <RefreshCw size={15} style={{ color: "var(--text-2)" }} />
                <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Reforge solution</span>
              </div>
              <p style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.6, marginBottom: 20 }}>
                This will discard the current solution and regenerate it from scratch with AI. Enter your PIN to continue.
              </p>
              <input
                className="font-mono"
                type="password"
                inputMode="numeric"
                placeholder="PIN"
                value={pinValue}
                autoFocus
                onChange={(e) => { setPinValue(e.target.value); setPinError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") handlePinSubmit(); if (e.key === "Escape") { setPinModal(false); setPinError(""); } }}
                style={{
                  width: "100%", padding: "9px 12px", fontSize: 14, letterSpacing: "0.2em",
                  background: "var(--surface-2)", border: `1px solid ${pinError ? "#f87171" : "var(--border-2)"}`,
                  borderRadius: 7, color: "var(--text)", outline: "none", marginBottom: 6,
                }}
              />
              {pinError && (
                <div className="font-mono" style={{ fontSize: 11, color: "#f87171", marginBottom: 10 }}>{pinError}</div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={() => { setPinModal(false); setPinError(""); }} className="font-mono" style={{
                  flex: 1, padding: "8px", fontSize: 11, fontWeight: 500, borderRadius: 7,
                  background: "transparent", border: "1px solid var(--border)", color: "var(--text-3)", cursor: "pointer",
                }}>
                  Cancel
                </button>
                <motion.button
                  onClick={handlePinSubmit}
                  disabled={resolveMutation.isPending || !pinValue}
                  whileTap={{ scale: 0.97 }}
                  className="font-mono"
                  style={{
                    flex: 1, padding: "8px", fontSize: 11, fontWeight: 600, borderRadius: 7,
                    background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.35)",
                    color: "#fbbf24", cursor: "pointer",
                    opacity: resolveMutation.isPending || !pinValue ? 0.5 : 1,
                  }}
                >
                  {resolveMutation.isPending ? "Reforging…" : "Reforge"}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </TooltipProvider>
  );
}

type SolutionView = "list" | "walkthrough";

function SolutionPanel({ solution, cfg, questions }: {
  solution: Solution;
  cfg: { primary: string; text: string; bg: string; border: string; glow?: string };
  questions: Question[];
}) {
  const [view, setView] = useState<SolutionView>("list");
  const stepCount = solution.steps.length;

  return (
    <div>
      {/* Toolbar: step count + AI summary hover + view toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div className="font-mono" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>
            {stepCount} step{stepCount !== 1 ? "s" : ""}
          </span>
          {solution.ai_model && (
            <span style={{ fontSize: 10, color: "var(--text-3)", opacity: 0.7 }}>
              · {solution.ai_model}
            </span>
          )}
          {solution.summary && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button style={{
                  display: "flex", alignItems: "center", gap: 4,
                  background: "none", border: "none", cursor: "pointer",
                  color: "var(--text-3)", padding: "2px 6px", borderRadius: 4,
                  fontSize: 10, fontFamily: "inherit",
                  transition: "color 0.15s",
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = cfg.text; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-3)"; }}
                >
                  <Info size={11} />
                  AI Summary
                </button>
              </TooltipTrigger>
              <TooltipContent style={{ maxWidth: "320px" }}>
                {solution.summary}
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* View toggle */}
        <div style={{
          display: "flex", alignItems: "center",
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 7, overflow: "hidden",
        }}>
          {([["list", List, "List"], ["walkthrough", PlayCircle, "Walkthrough"]] as const).map(([v, Icon, label]) => (
            <button
              key={v}
              onClick={() => setView(v as SolutionView)}
              className="font-mono"
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "6px 12px", fontSize: 11, fontWeight: 500,
                background: view === v ? cfg.bg : "transparent",
                border: "none",
                borderRight: v === "list" ? "1px solid var(--border)" : "none",
                color: view === v ? cfg.text : "var(--text-3)",
                cursor: "pointer", transition: "color 0.15s, background 0.15s",
              }}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {view === "list" ? (
          <motion.div key="list" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <SolutionStepList steps={solution.steps} questions={questions} githubUrl={lab.github_url} />
          </motion.div>
        ) : (
          <motion.div key="walkthrough" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <SolutionExecutionView steps={solution.steps} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SolvingPlaceholder({ cfg, solveLog }: { cfg: { primary: string; glow?: string }; solveLog?: string }) {
  const lines = (solveLog || "").trim().split("\n").filter(Boolean);
  const lastLine = lines.length > 0 ? lines[lines.length - 1] : undefined;
  const isError = lastLine?.includes("ERROR");
  const isWaitingForAI = !isError && !!lastLine && /sending to ai|waiting for ai/i.test(lastLine);

  const [elapsed, setElapsed] = useState(0);
  const [dots, setDots] = useState(".");

  useEffect(() => {
    if (!isWaitingForAI) { setElapsed(0); return; }
    setElapsed(0);
    const ticker = setInterval(() => {
      setElapsed(s => s + 1);
      setDots(d => d.length >= 3 ? "." : d + ".");
    }, 1000);
    return () => clearInterval(ticker);
  }, [isWaitingForAI, lastLine]);

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: "12px", overflow: "hidden",
    }}>
      {/* Spinner + status */}
      <div style={{ padding: "32px 28px 24px", textAlign: "center", borderBottom: lines.length > 0 ? "1px solid var(--border)" : "none" }}>
        <motion.div
          style={{
            width: 36, height: 36, borderRadius: "50%",
            border: `3px solid ${cfg.primary}`, borderTopColor: "transparent",
            margin: "0 auto 16px",
          }}
          animate={{ rotate: 360 }} transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
        />
        <p className="font-mono" style={{ fontSize: "13px", color: "var(--text-2)", marginBottom: "4px" }}>
          {isError ? "The forge encountered an obstacle" : "Solution is being crafted…"}
        </p>
        {lastLine && (
          <p className="font-mono" style={{ fontSize: "11px", color: isError ? "#f87171" : "#fbbf24" }}>
            {lastLine}{isWaitingForAI ? dots : ""}
          </p>
        )}
        {isWaitingForAI && (
          <p className="font-mono" style={{ fontSize: "10px", color: "var(--text-3)", marginTop: "6px" }}>
            The AI is at work — {elapsed}s elapsed · this page updates automatically
          </p>
        )}
        {!lastLine && (
          <p className="font-mono" style={{ fontSize: "11px", color: "var(--text-3)" }}>
            Your solution will emerge shortly — this page updates automatically
          </p>
        )}
      </div>

      {/* Full log */}
      {lines.length > 0 && (
        <div style={{ padding: "12px 20px" }}>
          <div className="font-mono" style={{ fontSize: 9, color: "var(--text-3)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
            Forge log
          </div>
          <pre className="font-mono" style={{
            fontSize: 11, color: "var(--text-3)", margin: 0, lineHeight: 1.8,
            whiteSpace: "pre-wrap", wordBreak: "break-all",
          }}>
            {lines.map((line, i) => {
              const isErr = line.includes("ERROR");
              const isDone = line.includes("Done ✓");
              return (
                <span key={i} style={{ display: "block", color: isErr ? "#f87171" : isDone ? "#34d399" : undefined }}>
                  {line}
                </span>
              );
            })}
          </pre>
        </div>
      )}
    </div>
  );
}

function PageLoading() {
  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "88px 40px", display: "flex", flexDirection: "column", gap: "16px" }}>
      {[60, 160, 120].map((h, i) => (
        <motion.div key={i} style={{ height: h, borderRadius: "10px", background: "var(--surface)", border: "1px solid var(--border)" }}
          animate={{ opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}

const CLASSIFICATION_CONFIG: Record<ExerciseClassification, { label: string; color: string; bg: string; border: string }> = {
  normal: { label: "normal", color: "var(--text-3)", bg: "var(--surface-2)", border: "var(--border)" },
  requires_generation: { label: "dynamic exercise", color: "#fbbf24", bg: "rgba(251,191,36,0.07)", border: "rgba(251,191,36,0.25)" },
  intentional_error: { label: "intentional error", color: "#f87171", bg: "rgba(248,113,113,0.07)", border: "rgba(248,113,113,0.25)" },
  ambiguous_manual_review: { label: "manual review", color: "#a78bfa", bg: "rgba(167,139,250,0.07)", border: "rgba(167,139,250,0.25)" },
};

function ClassificationBadge({ classification, reason }: { classification: ExerciseClassification; reason?: string }) {
  if (classification === "normal" || !classification) return null;
  const cfg = CLASSIFICATION_CONFIG[classification] ?? CLASSIFICATION_CONFIG.normal;
  const defaultReason =
    classification === "requires_generation" ? "Content required dynamic generation before solving" :
    classification === "intentional_error" ? "This exercise asks for an error — the error output is the correct answer" :
    "Exercise was unclear; auto-solve may be incomplete";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="font-mono" style={{
          display: "inline-flex", alignItems: "center", gap: "4px",
          fontSize: "9px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
          padding: "3px 8px", borderRadius: "4px",
          background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color,
          cursor: "default",
        }}>
          {classification === "intentional_error" && <AlertTriangle size={9} />}
          {cfg.label}
        </div>
      </TooltipTrigger>
      <TooltipContent style={{ maxWidth: "280px" }}>
        {reason || defaultReason}
      </TooltipContent>
    </Tooltip>
  );
}

const SOLVE_STATUS_DETAIL_CONFIG: Partial<Record<SolveStatusDetail, { label: string; color: string }>> = {
  repaired: { label: "repaired", color: "#fbbf24" },
  partial: { label: "partial", color: "#f87171" },
  unresolved: { label: "unresolved", color: "#f87171" },
  intentional_error_preserved: { label: "error preserved", color: "#a78bfa" },
};

function SolveStatusPill({ detail }: { detail: SolveStatusDetail }) {
  if (!detail || detail === "resolved") return null;
  const cfg = SOLVE_STATUS_DETAIL_CONFIG[detail];
  if (!cfg) return null;
  return (
    <span className="font-mono" style={{ fontSize: "10px", color: cfg.color }}>· {cfg.label}</span>
  );
}

const MD_STYLES: React.CSSProperties = {
  fontSize: "13px",
  color: "var(--text-2)",
  lineHeight: 1.75,
  wordBreak: "break-word",
};

function LabMarkdown({ content }: { content: string }) {
  return (
    <div style={MD_STYLES} className="lab-markdown">
      <ReactMarkdown
        components={{
          h1: ({ children }) => <h1 style={{ fontSize: "17px", fontWeight: 700, color: "var(--text)", marginBottom: "10px", marginTop: "18px", lineHeight: 1.3 }}>{children}</h1>,
          h2: ({ children }) => <h2 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text)", marginBottom: "8px", marginTop: "16px", lineHeight: 1.3 }}>{children}</h2>,
          h3: ({ children }) => <h3 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)", marginBottom: "6px", marginTop: "14px" }}>{children}</h3>,
          p: ({ children }) => <p style={{ margin: "0 0 10px" }}>{children}</p>,
          ul: ({ children }) => <ul style={{ margin: "0 0 10px", paddingLeft: "20px" }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ margin: "0 0 10px", paddingLeft: "20px" }}>{children}</ol>,
          li: ({ children }) => <li style={{ marginBottom: "4px" }}>{children}</li>,
          code: ({ children, className }) => {
            const isBlock = className?.includes("language-");
            return isBlock
              ? <code style={{ display: "block", padding: "12px 14px", background: "var(--bg)", borderRadius: "6px", fontSize: "12px", fontFamily: "var(--font-mono, monospace)", overflowX: "auto", marginBottom: "10px" }}>{children}</code>
              : <code style={{ background: "var(--surface-2)", borderRadius: "3px", padding: "1px 5px", fontSize: "12px", fontFamily: "var(--font-mono, monospace)" }}>{children}</code>;
          },
          pre: ({ children }) => <pre style={{ margin: "0 0 10px", background: "none", padding: 0 }}>{children}</pre>,
          strong: ({ children }) => <strong style={{ fontWeight: 700, color: "var(--text)" }}>{children}</strong>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
