import { useRef, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { gsap } from "gsap";
import { Clock, RefreshCw } from "lucide-react";
import { labsApi, configApi } from "../lib/api";
import { toast } from "../components/ui/Toaster";
import { LabCard } from "../components/LabCard";
import { CategoryChip, CATEGORY_CONFIG, getTopicConfig } from "../components/CategoryChip";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "../components/ui/Tooltip";
import { Category, Lab } from "../types";

const ALL_CATS: Category[] = ["linux", "git", "python", "homework"];

export function Dashboard() {
  const [filter, setFilter] = useState<string>("all");
  const countRefs = useRef<(HTMLSpanElement | null)[]>([]);

  const { data: labs = [], isLoading } = useQuery({
    queryKey: ["labs"],
    queryFn: labsApi.list,
    // Poll fast while any lab is unsolved or solving (auto-solve may be in flight)
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

  const total = labs.length;
  const solved = labs.filter((l) => l.solved).length;
  const pct = total > 0 ? Math.round((solved / total) * 100) : 0;

  useEffect(() => {
    if (isLoading) return;
    const targets = [total, solved];
    const suffixes = ["", ""];
    countRefs.current.forEach((el, i) => {
      if (!el) return;
      const proxy = { val: 0 };
      gsap.to(proxy, {
        val: targets[i], duration: 1, ease: "power2.out",
        onUpdate: () => { if (el) el.textContent = Math.round(proxy.val) + suffixes[i]; },
      });
    });
  }, [isLoading, total, solved]);

  const filtered = filter === "all" ? labs : labs.filter((l) => l.category === filter);

  return (
    <TooltipProvider>
      <div style={{ minHeight: "100vh", background: "var(--bg)" }}>

        {/* ── Hero header ─────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          style={{ paddingTop: "80px", borderBottom: "1px solid var(--border)" }}
        >
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "44px 40px 36px" }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "32px", flexWrap: "wrap" }}>

              {/* Left */}
              <div>
                <p className="font-mono" style={{ fontSize: "10px", color: "var(--text-3)", letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: "10px" }}>
                  DevSecOps · Intelligence at Your Command
                </p>
                <h1 style={{ fontSize: "34px", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: "8px" }}>
                  Lab Dashboard
                </h1>
                <p className="font-mono" style={{ fontSize: "12px", color: "var(--text-2)" }}>
                  AI-forged solutions · step-by-step mastery · on demand
                </p>
              </div>

              {/* Right — stats strip */}
              <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: "10px", overflow: "hidden" }}>
                {[
                  { label: "Labs",     refIdx: 0, color: "#60a5fa" },
                  { label: "Mastered", refIdx: 1, color: "#34d399" },
                ].map(({ label, refIdx, color }, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "16px 28px",
                      textAlign: "center",
                      borderRight: i < 1 ? "1px solid var(--border)" : "none",
                      background: "var(--surface)",
                    }}
                  >
                    <div className="font-mono" style={{ fontSize: "24px", fontWeight: 700, color, lineHeight: 1, marginBottom: "5px" }}>
                      <span ref={(el) => { countRefs.current[refIdx] = el; }}>–</span>
                    </div>
                    <div className="font-mono" style={{ fontSize: "10px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.15em" }}>
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Progress bar */}
            {total > 0 && (
              <div style={{ marginTop: "28px" }}>
                <div style={{ height: "4px", background: "rgba(255,255,255,0.07)", borderRadius: "2px", overflow: "hidden" }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: pct > 0 ? `${pct}%` : "2px" }}
                    transition={{ duration: 1, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    style={{ height: "100%", background: "linear-gradient(90deg, #3b82f6, #8b5cf6, #10b981)", borderRadius: "2px" }}
                  />
                </div>
                <div className="font-mono" style={{ marginTop: 5, fontSize: 9, color: "var(--text-3)", letterSpacing: "0.1em" }}>
                  {solved}/{total} solved
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* ── Solving queue ────────────────────────────────── */}
        {!isLoading && labs.some(l => l.solution_status === "solving" || l.solution_status === "unsolved") && (
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "20px 40px 0" }}>
            <SolvingQueue labs={labs} />
          </div>
        )}


        {/* ── Category breakdown ──────────────────────────── */}
        {!isLoading && total > 0 && (
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "12px 40px 0" }}>
            <CategoryBreakdown labs={labs} />
          </div>
        )}

        {/* ── Filter row ──────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
          style={{ maxWidth: "1200px", margin: "0 auto", padding: "20px 40px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {/* All button */}
            <button
              onClick={() => setFilter("all")}
              className="font-mono"
              style={{
                display: "inline-flex", alignItems: "center", gap: "6px",
                padding: "5px 12px", fontSize: "11px", fontWeight: 500, borderRadius: "6px",
                border: `1px solid ${filter === "all" ? "rgba(59,130,246,0.35)" : "var(--border)"}`,
                background: filter === "all" ? "rgba(59,130,246,0.1)" : "transparent",
                color: filter === "all" ? "#60a5fa" : "var(--text-2)",
                cursor: "pointer", transition: "all 0.15s",
              }}
            >
              All
              <span style={{ fontSize: "10px", opacity: 0.6 }}>{total}</span>
            </button>

            {ALL_CATS.map((cat) => {
              const count = labs.filter((l) => l.category === cat).length;
              const s = labs.filter((l) => l.category === cat && l.solved).length;
              return (
                <Tooltip key={cat}>
                  <TooltipTrigger asChild>
                    <span>
                      <CategoryChip category={cat} active={filter === cat} onClick={() => setFilter(filter === cat ? "all" : cat)} />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{s}/{count} solved</TooltipContent>
                </Tooltip>
              );
            })}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <NextSyncIndicator labs={labs} intervalMinutes={health?.scrape_interval_minutes ?? 60} />
          </div>
        </motion.div>

        {/* ── Lab grid ────────────────────────────────────── */}
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "4px 40px 64px" }}>
          {isLoading ? (
            <SkeletonGrid />
          ) : filtered.length === 0 ? (
            <EmptyState />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: "14px" }}>
              {filtered.map((lab, i) => <LabCard key={lab.slug} lab={lab} index={i} />)}
            </div>
          )}
        </div>

        {/* ── Footer ───────────────────────────────────────── */}
        <div className="font-mono" style={{
          textAlign: "center", padding: "24px 40px 40px",
          fontSize: 10, color: "var(--text-3)", letterSpacing: "0.08em",
        }}>
          Forged with precision by Guy Shonshon · {new Date().getFullYear()} · All rights reserved
        </div>

      </div>
    </TooltipProvider>
  );
}

// ── Solving queue panel ─────────────────────────────────────────────────────

function SolvingQueue({ labs }: { labs: Lab[] }) {
  const solving = labs.filter(l => l.solution_status === "solving");
  const pendingCount = labs.filter(l => l.solution_status === "unsolved").length;
  if (solving.length === 0 && pendingCount === 0) return null;

  const label = solving.length > 0
    ? `FORGING${pendingCount > 0 ? ` — ${pendingCount} awaiting dispatch` : ""}`
    : `AWAITING DISPATCH — ${pendingCount} lab${pendingCount !== 1 ? "s" : ""} in the queue`;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      style={{
        marginBottom: 16,
        border: "1px solid rgba(251,191,36,0.25)",
        borderRadius: 10,
        overflow: "hidden",
        background: "rgba(251,191,36,0.03)",
      }}
    >
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 16px",
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

      {/* Only show the actively solving labs */}
      {solving.map((lab) => {
        const lines = (lab.solve_log || "").trim().split("\n").filter(Boolean);
        const lastLine = lines.length > 0 ? lines[lines.length - 1] : "Solution is being crafted…";
        const isError = lastLine.includes("ERROR");

        return (
          <div key={lab.slug} style={{
            padding: "10px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.04)",
          }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: lines.length > 1 ? 8 : 0 }}>
              <span className="font-mono" style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", flexShrink: 0 }}>
                {lab.title}
              </span>
              <span className="font-mono" style={{
                fontSize: 11, color: isError ? "#f87171" : "#fbbf24",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {lastLine}
              </span>
            </div>

            {lines.length > 0 && (
              <pre className="font-mono" style={{
                fontSize: 10, color: "var(--text-3)", margin: 0, lineHeight: 1.7,
                background: "rgba(0,0,0,0.2)", borderRadius: 5,
                padding: "6px 10px", maxHeight: 120, overflowY: "auto",
                whiteSpace: "pre-wrap", wordBreak: "break-all",
              }}>
                {lines.join("\n")}
              </pre>
            )}
          </div>
        );
      })}
    </motion.div>
  );
}

// ── Category breakdown strip ────────────────────────────────────────────────

function CategoryBreakdown({ labs }: { labs: Lab[] }) {
  const categories = [...new Set(labs.map(l => l.category))];

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: `repeat(${Math.min(categories.length, 4)}, 1fr)`,
      gap: 12, paddingBottom: 20,
    }}>
      {categories.map((cat, i) => {
        const cfg = getTopicConfig(cat);
        const catLabs = labs.filter(l => l.category === cat);
        const solved = catLabs.filter(l => l.solution_status === "solved").length;
        const solving = catLabs.filter(l => l.solution_status === "solving").length;
        const pct = catLabs.length > 0 ? Math.round((solved / catLabs.length) * 100) : 0;

        return (
          <motion.div
            key={cat}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.25 }}
            style={{
              background: cfg.bg,
              border: `1px solid ${cfg.border}`,
              borderRadius: 9,
              padding: "14px 16px",
              borderLeft: `3px solid ${cfg.primary}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span className="font-mono" style={{
                fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
                textTransform: "uppercase", color: cfg.text,
              }}>
                {cfg.label !== "Topic" ? cfg.label : cat}
              </span>
            </div>

            {/* Progress bar */}
            <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, marginBottom: 8, overflow: "hidden" }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.7, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                style={{ height: "100%", background: cfg.primary, borderRadius: 2 }}
              />
            </div>

            <div className="font-mono" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 10, color: "var(--text-3)" }}>
                {solved}/{catLabs.length} solved
              </span>
              {solving > 0 && (
                <span style={{ fontSize: 10, color: "#fbbf24", display: "flex", alignItems: "center", gap: 4 }}>
                  <motion.span
                    style={{ width: 5, height: 5, borderRadius: "50%", background: "#fbbf24", display: "inline-block" }}
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                  {solving} solving
                </span>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}


// ── PIN modal ────────────────────────────────────────────────────────────────

const PIN_KEYS = ["1","2","3","4","5","6","7","8","9","⌫","0","↵"];

function PinModal({ onSuccess, onClose, errorCount }: { onSuccess: (pin: string) => void; onClose: () => void; errorCount?: number }) {
  const [digits, setDigits] = useState<string[]>([]);
  const [shake, setShake] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Reset and shake when parent increments errorCount (wrong PIN from backend)
  useEffect(() => {
    if (!errorCount) return;
    setSubmitted(false);
    setShake(true);
    setDigits([]);
    setTimeout(() => setShake(false), 500);
  }, [errorCount]);

  const triggerShake = () => {
    setShake(true);
    setDigits([]);
    setTimeout(() => setShake(false), 500);
  };

  const handleKey = (k: string) => {
    if (submitted) return;
    if (k === "⌫") {
      setDigits((d) => d.slice(0, -1));
    } else if (k === "↵") {
      if (digits.length === 4) {
        setSubmitted(true);
        onSuccess(digits.join(""));
      } else {
        triggerShake();
      }
    } else if (digits.length < 4) {
      const next = [...digits, k];
      setDigits(next);
      if (next.length === 4) {
        // auto-submit
        setSubmitted(true);
        onSuccess(next.join(""));
      }
    }
  };

  // Keyboard support — ref avoids stale closure over handleKey
  const handleKeyRef = useRef(handleKey);
  handleKeyRef.current = handleKey;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") handleKeyRef.current(e.key);
      else if (e.key === "Backspace") handleKeyRef.current("⌫");
      else if (e.key === "Enter") handleKeyRef.current("↵");
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.9, y: 12 }}
        animate={shake
          ? { opacity: 1, scale: 1, y: 0, x: [0, -10, 10, -8, 8, -4, 4, 0] }
          : { opacity: 1, scale: 1, y: 0, x: 0 }
        }
        transition={shake ? { duration: 0.45, ease: "easeInOut" } : { duration: 0.25, ease: [0.16,1,0.3,1] }}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: "32px 28px 28px",
          width: 280,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 24,
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center" }}>
          <p className="font-mono" style={{ fontSize: 9, letterSpacing: "0.3em", color: "var(--text-3)", textTransform: "uppercase", marginBottom: 6 }}>
            Authorization Required
          </p>
          <p className="font-mono" style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
            Enter Sync PIN
          </p>
        </div>

        {/* Dot indicators */}
        <div style={{ display: "flex", gap: 14 }}>
          {[0,1,2,3].map((i) => (
            <motion.div
              key={i}
              animate={{ scale: digits.length === i + 1 ? [1, 1.35, 1] : 1 }}
              transition={{ duration: 0.18 }}
              style={{
                width: 14, height: 14, borderRadius: "50%",
                background: i < digits.length ? "#60a5fa" : "transparent",
                border: `2px solid ${i < digits.length ? "#60a5fa" : "rgba(255,255,255,0.2)"}`,
                transition: "background 0.15s, border-color 0.15s",
              }}
            />
          ))}
        </div>

        {/* Numpad */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, width: "100%" }}>
          {PIN_KEYS.map((k) => {
            const isAction = k === "⌫" || k === "↵";
            const isEnter = k === "↵";
            return (
              <button
                key={k}
                onClick={() => handleKey(k)}
                className="font-mono"
                style={{
                  height: 52,
                  borderRadius: 10,
                  border: `1px solid ${isEnter && digits.length === 4 ? "rgba(96,165,250,0.5)" : "var(--border)"}`,
                  background: isEnter && digits.length === 4
                    ? "rgba(96,165,250,0.15)"
                    : isAction
                    ? "rgba(255,255,255,0.04)"
                    : "var(--bg)",
                  color: isAction ? "var(--text-2)" : "var(--text)",
                  fontSize: isAction ? 16 : 18,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.12s",
                  letterSpacing: isEnter ? "0" : "0",
                }}
              >
                {k}
              </button>
            );
          })}
        </div>

        {/* Cancel */}
        <button
          onClick={onClose}
          className="font-mono"
          style={{
            fontSize: 10, color: "var(--text-3)", letterSpacing: "0.1em",
            background: "none", border: "none", cursor: "pointer",
            textTransform: "uppercase",
          }}
        >
          Cancel
        </button>
      </motion.div>
    </div>
  );
}

// ── Next sync indicator ──────────────────────────────────────────────────────

function NextSyncIndicator({ labs, intervalMinutes }: { labs: { last_scraped?: string | null }[]; intervalMinutes: number }) {
  const qc = useQueryClient();
  const [countdown, setCountdown] = useState<string>("");
  const [pinOpen, setPinOpen] = useState(false);
  const [pinErrorCount, setPinErrorCount] = useState(0);

  // Repeating countdown: shows time remaining in the current 60-min cycle.
  useEffect(() => {
    const lastScrapeMs = labs
      .filter((l) => l.last_scraped)
      .map((l) => new Date(l.last_scraped!).getTime())
      .sort()
      .reverse()[0];

    if (!lastScrapeMs) {
      setCountdown("—");
      return;
    }

    const cycleMs = intervalMinutes * 60_000;

    const tick = () => {
      const elapsed = (Date.now() - lastScrapeMs) % cycleMs;
      const remaining = cycleMs - elapsed;
      const m = Math.floor(remaining / 60_000);
      const s = Math.floor((remaining % 60_000) / 1000);
      setCountdown(`${m}:${String(s).padStart(2, "0")}`);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
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
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 403) {
        setPinErrorCount((n) => n + 1);
        toast("Wrong PIN — access denied", "error");
      } else {
        toast(`Sync failed: ${(err as Error).message}`, "error");
      }
    },
  });

  const isSyncing = syncMutation.isPending;

  const handlePinSuccess = (pin: string) => {
    syncMutation.mutate(pin, {
      onSuccess: () => setPinOpen(false),
      // keep modal open on error so user can retry or cancel
    });
  };

  return (
    <>
      {pinOpen && (
        <PinModal
          onSuccess={handlePinSuccess}
          onClose={() => { setPinOpen(false); syncMutation.reset(); }}
          errorCount={pinErrorCount}
        />
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => { if (!isSyncing) setPinOpen(true); }}
            className="font-mono"
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "6px 12px", fontSize: "11px",
              border: "1px solid var(--border)",
              borderRadius: "6px", background: "transparent",
              color: isSyncing ? "#60a5fa" : "var(--text-3)",
              cursor: isSyncing ? "wait" : "pointer",
              transition: "color 0.15s, border-color 0.15s",
            }}
          >
            {isSyncing
              ? <RefreshCw size={11} style={{ animation: "spin 0.9s linear infinite" }} />
              : <Clock size={11} />}
            <span>{isSyncing ? "syncing…" : "next sync"}</span>
            {!isSyncing && (
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{countdown}</span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {isSyncing
            ? "Syncing labs with the course site…"
            : `Click to sync now · auto-syncs every ${intervalMinutes} min`}
        </TooltipContent>
      </Tooltip>
    </>
  );
}

function SkeletonGrid() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: "14px" }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <motion.div key={i}
          style={{ height: "108px", borderRadius: "10px", background: "var(--surface)", border: "1px solid var(--border)" }}
          animate={{ opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.12 }}
        />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ textAlign: "center", padding: "72px 0" }}>
      <p className="font-mono" style={{ fontSize: "13px", color: "var(--text-2)" }}>The vault is empty</p>
      <p className="font-mono" style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "6px" }}>Summon your labs — click the sync button above</p>
    </div>
  );
}
