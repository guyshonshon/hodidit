/**
 * Dashboard — overview / status page.
 *
 * Distinct from Labs (browse): shows progress at a glance, the live solve
 * queue, per-category completion, and a recent-activity feed.
 * No lab grid — use Labs for that.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { gsap } from "gsap";
import { Clock, RefreshCw, ArrowRight, CheckCircle2 } from "lucide-react";
import { labsApi, configApi } from "../lib/api";
import { toast } from "../components/ui/Toaster";
import { getTopicConfig } from "../components/CategoryChip";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "../components/ui/Tooltip";
import { Lab } from "../types";

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 640);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return mobile;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const GH_ICON = (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
      0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
      -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66
      .07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15
      -.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0
      1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56
      .82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07
      -.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
  </svg>
);

export function Dashboard() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const totalRef = useRef<HTMLSpanElement>(null);
  const solvedRef = useRef<HTMLSpanElement>(null);

  const { data: labs = [], isLoading } = useQuery({
    queryKey: ["labs"],
    queryFn: labsApi.list,
    refetchInterval: (query) => {
      const data = query.state.data ?? [];
      const hasActive = data.some((l: { solution_status: string }) =>
        l.solution_status === "solving" || l.solution_status === "unsolved"
      );
      return hasActive ? 2000 : 30_000;
    },
  });

  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: configApi.health,
    staleTime: Infinity,
  });

  const { data: meta } = useQuery({
    queryKey: ["meta"],
    queryFn: configApi.meta,
    staleTime: 600_000,
    retry: false,
  });

  const total = labs.length;
  const solved = labs.filter(l => l.solved).length;
  const unsolved = total - solved;
  const solving = labs.filter(l => l.solution_status === "solving").length;
  const pct = total > 0 ? Math.round((solved / total) * 100) : 0;

  // Animate stat counters
  useEffect(() => {
    if (isLoading) return;
    [{ el: totalRef.current, target: total }, { el: solvedRef.current, target: solved }].forEach(({ el, target }) => {
      if (!el) return;
      const proxy = { val: 0 };
      gsap.to(proxy, { val: target, duration: 0.9, ease: "power2.out", onUpdate: () => { if (el) el.textContent = String(Math.round(proxy.val)); } });
    });
  }, [isLoading, total, solved]);

  const recentlySolved = [...labs]
    .filter(l => l.solved && l.solved_at)
    .sort((a, b) => new Date(b.solved_at!).getTime() - new Date(a.solved_at!).getTime())
    .slice(0, 5);

  const categories = [...new Set(labs.map(l => l.category))];

  // Subcategory breakdown (labs / homework / lessons / …)
  const subcatKeys = [...new Set(labs.map(l => l.subcategory ?? "other"))].sort();
  const subcatRows = subcatKeys.map(sc => ({
    label: sc,
    total: labs.filter(l => (l.subcategory ?? "other") === sc).length,
    solved: labs.filter(l => (l.subcategory ?? "other") === sc && l.solved).length,
  }));

  const STAT_CARDS = [
    { label: "Total", value: total, color: "#60a5fa", bg: "rgba(59,130,246,0.07)", border: "rgba(59,130,246,0.18)" },
    { label: "Solved", value: solved, color: "#34d399", bg: "rgba(52,211,153,0.07)", border: "rgba(52,211,153,0.18)" },
    { label: "Unsolved", value: unsolved, color: unsolved > 0 ? "#fbbf24" : "var(--text-3)", bg: unsolved > 0 ? "rgba(251,191,36,0.07)" : "var(--surface)", border: unsolved > 0 ? "rgba(251,191,36,0.18)" : "var(--border)" },
    { label: "Complete", value: `${pct}%`, color: "#a78bfa", bg: "rgba(139,92,246,0.07)", border: "rgba(139,92,246,0.18)" },
  ];

  return (
    <TooltipProvider>
      <div style={{ minHeight: "100vh", background: "var(--bg)", paddingTop: "52px" }}>
        <div style={{ maxWidth: "1400px", margin: "0 auto", padding: isMobile ? "28px 16px 48px" : "40px 48px 64px" }}>

          {/* ── Header ─────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            style={{ marginBottom: 28 }}
          >
            <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div>
                <p className="font-mono" style={{ fontSize: 10, color: "var(--text-3)", letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 10 }}>
                  DevSecOps22 · Overview
                </p>
                <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
                  <span className="font-mono" style={{ fontSize: isMobile ? 36 : 48, fontWeight: 700, color: "#60a5fa", lineHeight: 1 }}>
                    <span ref={solvedRef}>–</span>
                  </span>
                  <span className="font-mono" style={{ fontSize: 15, color: "var(--text-3)" }}>
                    / <span ref={totalRef}>–</span> solved
                  </span>
                  {solving > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <motion.span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fbbf24", display: "inline-block" }}
                        animate={{ opacity: [1, 0.25, 1] }} transition={{ duration: 1, repeat: Infinity }} />
                      <span className="font-mono" style={{ fontSize: 11, color: "#fbbf24" }}>{solving} forging</span>
                    </div>
                  )}
                </div>
                {total > 0 && (
                  <div style={{ marginTop: 14, width: isMobile ? "100%" : 400 }}>
                    <div style={{ height: 5, background: "rgba(255,255,255,0.07)", borderRadius: 3, overflow: "hidden" }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: pct > 0 ? `${pct}%` : "3px" }}
                        transition={{ duration: 1.1, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
                        style={{ height: "100%", background: "linear-gradient(90deg, #3b82f6, #8b5cf6, #10b981)", borderRadius: 3 }}
                      />
                    </div>
                    <span className="font-mono" style={{ fontSize: 9, color: "var(--text-3)", marginTop: 5, display: "block", letterSpacing: "0.08em" }}>
                      {pct}% complete
                    </span>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button onClick={() => navigate("/labs")} className="font-mono"
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", fontSize: 11, fontWeight: 600, background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: 7, color: "#60a5fa", cursor: "pointer" }}>
                  Browse Labs <ArrowRight size={11} />
                </button>
                <NextSyncIndicator labs={labs} intervalMinutes={health?.scrape_interval_minutes ?? 60} />
              </div>
            </div>
          </motion.div>

          {/* ── Stat cards ──────────────────────────────────────────── */}
          {!isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
              style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}
            >
              {STAT_CARDS.map((c, i) => (
                <motion.div key={c.label}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 + i * 0.04 }}
                  style={{ padding: "16px 20px", borderRadius: 10, background: c.bg, border: `1px solid ${c.border}` }}
                >
                  <div className="font-mono" style={{ fontSize: isMobile ? 24 : 28, fontWeight: 700, color: c.color, lineHeight: 1, marginBottom: 5 }}>
                    {c.value}
                  </div>
                  <div className="font-mono" style={{ fontSize: 9, color: "var(--text-3)", letterSpacing: "0.2em", textTransform: "uppercase" }}>
                    {c.label}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}

          {/* ── Solving queue ───────────────────────────────────────── */}
          <AnimatePresence>
            {!isLoading && labs.some(l => l.solution_status === "solving" || l.solution_status === "unsolved") && (
              <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} style={{ marginBottom: 28 }}>
                <SolvingQueue labs={labs} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Topics — full width ──────────────────────────────────── */}
          <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} style={{ marginBottom: 24 }}>
            <SectionLabel>Topics</SectionLabel>
            {isLoading ? <SkeletonList count={3} /> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {categories.map((cat, i) => {
                  const cfg = getTopicConfig(cat);
                  const catLabs = labs.filter(l => l.category === cat);
                  const catSolved = catLabs.filter(l => l.solved).length;
                  const catSolving = catLabs.filter(l => l.solution_status === "solving").length;
                  const catPct = catLabs.length > 0 ? Math.round((catSolved / catLabs.length) * 100) : 0;
                  return (
                    <motion.div key={cat}
                      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.12 + i * 0.04 }}
                      onClick={() => navigate(`/labs?cat=${cat}`)}
                      style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 18px", background: "var(--surface)", border: `1px solid var(--border)`, borderLeft: `4px solid ${cfg.primary}`, borderRadius: 8, cursor: "pointer", transition: "background 0.15s, border-color 0.15s" }}
                      onMouseEnter={e => { e.currentTarget.style.background = cfg.bg; e.currentTarget.style.borderColor = cfg.border; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "var(--surface)"; e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.borderLeftColor = cfg.primary; }}
                    >
                      <span className="font-mono" style={{ fontSize: 12, fontWeight: 700, color: cfg.text, textTransform: "uppercase", letterSpacing: "0.08em", minWidth: 72 }}>
                        {cfg.label !== "Topic" ? cfg.label : cat}
                      </span>
                      <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.07)", borderRadius: 3, overflow: "hidden" }}>
                        <motion.div initial={{ width: 0 }} animate={{ width: `${catPct}%` }}
                          transition={{ duration: 0.8, delay: 0.2 + i * 0.07, ease: [0.16, 1, 0.3, 1] }}
                          style={{ height: "100%", background: cfg.primary, borderRadius: 3 }} />
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                        {catSolving > 0 && (
                          <motion.span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fbbf24", display: "inline-block" }}
                            animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }} />
                        )}
                        <span className="font-mono" style={{ fontSize: 11, color: "var(--text-3)", minWidth: 52, textAlign: "right" }}>
                          {catSolved}/{catLabs.length}
                        </span>
                        <span className="font-mono" style={{ fontSize: 11, fontWeight: 700, color: cfg.text, minWidth: 36, textAlign: "right" }}>{catPct}%</span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.section>

          {/* ── Bottom grid: Recently Solved + By Type ───────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "3fr 2fr", gap: 20, alignItems: "start" }}>

            {/* Recently Solved */}
            <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <SectionLabel>Recently Solved</SectionLabel>
                {meta?.target_repo && (
                  <a href={`https://github.com/${meta.target_repo}`} target="_blank" rel="noopener noreferrer" className="font-mono"
                    style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, color: "var(--text-3)", textDecoration: "none", padding: "3px 8px", borderRadius: 4, border: "1px solid var(--border)", transition: "color 0.15s, border-color 0.15s" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#60a5fa"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(59,130,246,0.35)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-3)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
                  >
                    {GH_ICON} {meta.target_repo.split("/")[1]}
                  </a>
                )}
              </div>
              {isLoading ? <SkeletonList count={4} /> : recentlySolved.length === 0 ? (
                <div className="font-mono" style={{ padding: "32px 20px", textAlign: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--text-3)" }}>
                  No labs solved yet
                </div>
              ) : (
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                  {recentlySolved.map((lab, i) => {
                    const cfg = getTopicConfig(lab.ai_topic ?? lab.category);
                    return (
                      <motion.div key={lab.slug}
                        initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 + i * 0.04 }}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", borderBottom: i < recentlySolved.length - 1 ? "1px solid var(--border)" : "none", transition: "background 0.12s" }}
                        onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.025)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                      >
                        <CheckCircle2 size={13} style={{ color: cfg.primary, flexShrink: 0, opacity: 0.75 }} />
                        <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => navigate(`/labs/${lab.slug}`)}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {lab.title}
                          </div>
                          <div className="font-mono" style={{ fontSize: 9, color: cfg.text, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>
                            {cfg.label !== "Topic" ? cfg.label : lab.category}
                            {lab.subcategory && <span style={{ color: "var(--text-3)", marginLeft: 5 }}>· {lab.subcategory}</span>}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          <span className="font-mono" style={{ fontSize: 10, color: "var(--text-3)" }}>
                            {timeAgo(lab.solved_at!)}
                          </span>
                          {lab.github_url && (
                            <a href={lab.github_url} target="_blank" rel="noopener noreferrer"
                              title="View source on GitHub"
                              style={{ color: "var(--text-3)", opacity: 0.5, textDecoration: "none", display: "flex", alignItems: "center", transition: "opacity 0.15s" }}
                              onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                              onMouseLeave={e => (e.currentTarget.style.opacity = "0.5")}
                              onClick={e => e.stopPropagation()}
                            >
                              {GH_ICON}
                            </a>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                  <div onClick={() => navigate("/labs")}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 16px", cursor: "pointer", borderTop: "1px solid var(--border)", transition: "background 0.12s" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.02)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <span className="font-mono" style={{ fontSize: 10, color: "var(--text-3)" }}>View all labs</span>
                    <ArrowRight size={10} style={{ color: "var(--text-3)" }} />
                  </div>
                </div>
              )}
            </motion.section>

            {/* By Type */}
            <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.26 }}>
              <SectionLabel>By Type</SectionLabel>
              {isLoading ? <SkeletonList count={3} /> : (
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                  {subcatRows.map((row, i) => {
                    const rowPct = row.total > 0 ? Math.round((row.solved / row.total) * 100) : 0;
                    const allDone = row.solved === row.total && row.total > 0;
                    return (
                      <div key={row.label}
                        style={{ padding: "13px 16px", borderBottom: i < subcatRows.length - 1 ? "1px solid var(--border)" : "none" }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
                          <span className="font-mono" style={{ fontSize: 11, fontWeight: 600, color: allDone ? "#34d399" : "var(--text-2)", textTransform: "capitalize", letterSpacing: "0.04em" }}>
                            {row.label}
                          </span>
                          <span className="font-mono" style={{ fontSize: 10, color: allDone ? "#34d399" : "var(--text-3)" }}>
                            {row.solved}/{row.total} · {rowPct}%
                          </span>
                        </div>
                        <div style={{ height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2, overflow: "hidden" }}>
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${rowPct}%` }}
                            transition={{ duration: 0.7, delay: 0.28 + i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                            style={{ height: "100%", background: allDone ? "#34d399" : "#60a5fa", borderRadius: 2 }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.section>

          </div>

          {/* ── Footer ───────────────────────────────────────────────── */}
          <div className="font-mono" style={{ marginTop: 52, textAlign: "center", fontSize: 10, color: "var(--text-3)", letterSpacing: "0.08em" }}>
            Crafted by Guy Shonshon · {new Date().getFullYear()}
          </div>

        </div>
      </div>
    </TooltipProvider>
  );
}

// ── Shared ────────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono" style={{ fontSize: 9, color: "var(--text-3)", letterSpacing: "0.25em", textTransform: "uppercase", marginBottom: 10 }}>
      {children}
    </p>
  );
}

function SkeletonList({ count }: { count: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <motion.div key={i}
          style={{ height: 44, borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)" }}
          animate={{ opacity: [0.5, 0.75, 0.5] }}
          transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.12 }}
        />
      ))}
    </div>
  );
}

// ── Solving queue ─────────────────────────────────────────────────────────────

function SolvingQueue({ labs }: { labs: Lab[] }) {
  const solving = labs.filter(l => l.solution_status === "solving");
  const pendingCount = labs.filter(l => l.solution_status === "unsolved").length;
  if (solving.length === 0 && pendingCount === 0) return null;

  const label = solving.length > 0
    ? `FORGING${pendingCount > 0 ? ` — ${pendingCount} awaiting dispatch` : ""}`
    : `AWAITING DISPATCH — ${pendingCount} lab${pendingCount !== 1 ? "s" : ""} in the queue`;

  return (
    <div style={{
      border: "1px solid rgba(251,191,36,0.25)", borderRadius: 10,
      overflow: "hidden", background: "rgba(251,191,36,0.03)",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
        borderBottom: solving.length > 0 ? "1px solid rgba(251,191,36,0.15)" : "none",
        background: "rgba(251,191,36,0.06)",
      }}>
        <motion.span
          style={{ width: 7, height: 7, borderRadius: "50%", background: "#fbbf24", display: "inline-block", flexShrink: 0 }}
          animate={{ opacity: [1, 0.25, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
        <span className="font-mono" style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24", letterSpacing: "0.08em" }}>
          {label}
        </span>
      </div>
      {solving.map((lab) => {
        const lines = (lab.solve_log || "").trim().split("\n").filter(Boolean);
        const lastLine = lines[lines.length - 1] ?? "Solution is being crafted…";
        const isError = lastLine.includes("ERROR");
        return (
          <div key={lab.slug} style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: lines.length > 1 ? 8 : 0 }}>
              <span className="font-mono" style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", flexShrink: 0 }}>{lab.title}</span>
              <span className="font-mono" style={{ fontSize: 11, color: isError ? "#f87171" : "#fbbf24", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {lastLine}
              </span>
            </div>
            {lines.length > 0 && (
              <pre className="font-mono" style={{
                fontSize: 10, color: "var(--text-3)", margin: 0, lineHeight: 1.7,
                background: "rgba(0,0,0,0.2)", borderRadius: 5, padding: "6px 10px",
                maxHeight: 100, overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all",
              }}>
                {lines.join("\n")}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── PIN modal ─────────────────────────────────────────────────────────────────

const PIN_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "↵"];

function PinModal({ onSuccess, onClose, errorCount }: { onSuccess: (pin: string) => void; onClose: () => void; errorCount?: number }) {
  const [digits, setDigits] = useState<string[]>([]);
  const [shake, setShake] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!errorCount) return;
    setSubmitted(false); setShake(true); setDigits([]);
    setTimeout(() => setShake(false), 500);
  }, [errorCount]);

  const triggerShake = () => { setShake(true); setDigits([]); setTimeout(() => setShake(false), 500); };

  const handleKey = (k: string) => {
    if (submitted) return;
    if (k === "⌫") { setDigits(d => d.slice(0, -1)); }
    else if (k === "↵") {
      if (digits.length === 4) { setSubmitted(true); onSuccess(digits.join("")); }
      else triggerShake();
    } else if (digits.length < 4) {
      const next = [...digits, k]; setDigits(next);
      if (next.length === 4) { setSubmitted(true); onSuccess(next.join("")); }
    }
  };
  const handleKeyRef = useRef(handleKey);
  handleKeyRef.current = handleKey;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") handleKeyRef.current(e.key);
      else if (e.key === "Backspace") handleKeyRef.current("⌫");
      else if (e.key === "Enter") handleKeyRef.current("↵");
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <motion.div
        onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.9, y: 12 }}
        animate={shake ? { opacity: 1, scale: 1, y: 0, x: [0, -10, 10, -8, 8, -4, 4, 0] } : { opacity: 1, scale: 1, y: 0, x: 0 }}
        transition={shake ? { duration: 0.45 } : { duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "32px 28px 28px", width: 280, display: "flex", flexDirection: "column", alignItems: "center", gap: 24, boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}
      >
        <div style={{ textAlign: "center" }}>
          <p className="font-mono" style={{ fontSize: 9, letterSpacing: "0.3em", color: "var(--text-3)", textTransform: "uppercase", marginBottom: 6 }}>Authorization Required</p>
          <p className="font-mono" style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Enter Sync PIN</p>
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          {[0, 1, 2, 3].map(i => (
            <motion.div key={i} animate={{ scale: digits.length === i + 1 ? [1, 1.35, 1] : 1 }} transition={{ duration: 0.18 }}
              style={{ width: 14, height: 14, borderRadius: "50%", background: i < digits.length ? "#60a5fa" : "transparent", border: `2px solid ${i < digits.length ? "#60a5fa" : "rgba(255,255,255,0.2)"}`, transition: "background 0.15s" }}
            />
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, width: "100%" }}>
          {PIN_KEYS.map(k => {
            const isAction = k === "⌫" || k === "↵";
            const isEnter = k === "↵";
            return (
              <button key={k} onClick={() => handleKey(k)} className="font-mono"
                style={{ height: 52, borderRadius: 10, border: `1px solid ${isEnter && digits.length === 4 ? "rgba(96,165,250,0.5)" : "var(--border)"}`, background: isEnter && digits.length === 4 ? "rgba(96,165,250,0.15)" : isAction ? "rgba(255,255,255,0.04)" : "var(--bg)", color: isAction ? "var(--text-2)" : "var(--text)", fontSize: isAction ? 16 : 18, fontWeight: 600, cursor: "pointer" }}>
                {k}
              </button>
            );
          })}
        </div>
        <button onClick={onClose} className="font-mono" style={{ fontSize: 10, color: "var(--text-3)", letterSpacing: "0.1em", background: "none", border: "none", cursor: "pointer", textTransform: "uppercase" }}>Cancel</button>
      </motion.div>
    </div>
  );
}

// ── Next sync indicator ───────────────────────────────────────────────────────

function NextSyncIndicator({ labs, intervalMinutes }: { labs: { last_scraped?: string | null }[]; intervalMinutes: number }) {
  const qc = useQueryClient();
  const [countdown, setCountdown] = useState("");
  const [pinOpen, setPinOpen] = useState(false);
  const [pinErrorCount, setPinErrorCount] = useState(0);

  useEffect(() => {
    const lastMs = labs.filter(l => l.last_scraped).map(l => new Date(l.last_scraped!).getTime()).sort().reverse()[0];
    if (!lastMs) { setCountdown("—"); return; }
    const cycleMs = intervalMinutes * 60_000;
    const tick = () => { const rem = cycleMs - ((Date.now() - lastMs) % cycleMs); const m = Math.floor(rem / 60_000); const s = Math.floor((rem % 60_000) / 1000); setCountdown(`${m}:${String(s).padStart(2, "0")}`); };
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id);
  }, [labs, intervalMinutes]);

  const syncMutation = useMutation({
    mutationFn: (pin: string) => labsApi.sync(pin),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["labs"] });
      const parts: string[] = [];
      if (data.added) parts.push(`+${data.added} new`);
      if (data.updated) parts.push(`${data.updated} updated`);
      toast(`Sync done${parts.length ? `: ${parts.join(", ")}` : " — no changes"}`, "success");
    },
    onError: (err: unknown) => {
      const res = (err as { response?: { status?: number; data?: { detail?: string } } })?.response;
      if (res?.status === 429) { setPinErrorCount(n => n + 1); toast(res.data?.detail ?? "Too many attempts", "error"); }
      else if (res?.status === 403) { setPinErrorCount(n => n + 1); toast("Wrong PIN", "error"); }
      else toast(`Sync failed: ${(err as Error).message}`, "error");
    },
  });

  const isSyncing = syncMutation.isPending;

  return (
    <>
      {pinOpen && <PinModal onSuccess={pin => syncMutation.mutate(pin, { onSuccess: () => setPinOpen(false) })} onClose={() => { setPinOpen(false); syncMutation.reset(); }} errorCount={pinErrorCount} />}
      <Tooltip>
        <TooltipTrigger asChild>
          <button onClick={() => { if (!isSyncing) setPinOpen(true); }} className="font-mono"
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", fontSize: 11, border: "1px solid var(--border)", borderRadius: 6, background: "transparent", color: isSyncing ? "#60a5fa" : "var(--text-3)", cursor: isSyncing ? "wait" : "pointer" }}>
            {isSyncing ? <RefreshCw size={11} style={{ animation: "spin 0.9s linear infinite" }} /> : <Clock size={11} />}
            <span>{isSyncing ? "syncing…" : "sync"}</span>
            {!isSyncing && <span style={{ fontVariantNumeric: "tabular-nums" }}>{countdown}</span>}
          </button>
        </TooltipTrigger>
        <TooltipContent>{isSyncing ? "Syncing…" : `Click to sync now · auto-syncs every ${intervalMinutes} min`}</TooltipContent>
      </Tooltip>
    </>
  );
}
