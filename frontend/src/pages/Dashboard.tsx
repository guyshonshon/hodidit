/**
 * Dashboard — compact home overview.
 *
 * The homepage intentionally stays focused on the main progress signal.
 * Browse/filter work happens on the Labs page.
 */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { gsap } from "gsap";
import { ArrowRight, Clock, RefreshCw } from "lucide-react";
import { labsApi, configApi } from "../lib/api";
import { toast } from "../components/ui/Toaster";
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/Tooltip";

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 640);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return mobile;
}

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

  const total = labs.length;
  const solved = labs.filter(l => l.solved).length;
  const solving = labs.filter(l => l.solution_status === "solving").length;
  const pct = total > 0 ? Math.round((solved / total) * 100) : 0;

  useEffect(() => {
    if (isLoading) return;
    [
      { el: solvedRef.current, target: solved },
      { el: totalRef.current, target: total },
    ].forEach(({ el, target }) => {
      if (!el) return;
      const proxy = { val: 0 };
      gsap.to(proxy, {
        val: target,
        duration: 0.9,
        ease: "power2.out",
        onUpdate: () => { el.textContent = String(Math.round(proxy.val)); },
      });
    });
  }, [isLoading, solved, total]);

  return (
    <TooltipProvider>
      <div style={{ minHeight: "100vh", background: "var(--bg)", paddingTop: "52px" }}>
        <main style={{
          minHeight: "calc(100vh - 52px)",
          maxWidth: 900,
          margin: "0 auto",
          padding: isMobile ? "56px 20px" : "92px 48px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}>
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="font-mono" style={{
              fontSize: 10,
              color: "var(--text-3)",
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              marginBottom: 16,
            }}>
              DevSecOps22 · Overview
            </p>

            <div style={{ display: "flex", alignItems: "baseline", gap: 18, flexWrap: "wrap" }}>
              <span className="font-mono" style={{
                fontSize: isMobile ? 56 : 86,
                fontWeight: 800,
                color: "#60a5fa",
                lineHeight: 0.95,
              }}>
                <span ref={solvedRef}>-</span>
              </span>
              <span className="font-mono" style={{ fontSize: isMobile ? 18 : 22, color: "var(--text-3)" }}>
                / <span ref={totalRef}>-</span> solved
              </span>
              {solving > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <motion.span
                    style={{ width: 7, height: 7, borderRadius: "50%", background: "#fbbf24", display: "inline-block" }}
                    animate={{ opacity: [1, 0.25, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                  <span className="font-mono" style={{ fontSize: 12, color: "#fbbf24" }}>
                    {solving} forging
                  </span>
                </div>
              )}
            </div>

            <div style={{ marginTop: 24, width: "100%", maxWidth: 560 }}>
              <div style={{ height: 7, background: "rgba(255,255,255,0.07)", borderRadius: 4, overflow: "hidden" }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: pct > 0 ? `${pct}%` : "3px" }}
                  transition={{ duration: 1.1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    height: "100%",
                    background: "linear-gradient(90deg, #3b82f6, #8b5cf6, #10b981)",
                    borderRadius: 4,
                  }}
                />
              </div>
              <span className="font-mono" style={{
                display: "block",
                marginTop: 8,
                fontSize: 10,
                color: "var(--text-3)",
                letterSpacing: "0.08em",
              }}>
                {pct}% complete
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 34 }}>
              <button
                onClick={() => navigate("/labs")}
                className="font-mono"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "10px 18px",
                  fontSize: 11,
                  fontWeight: 700,
                  background: "rgba(59,130,246,0.08)",
                  border: "1px solid rgba(59,130,246,0.25)",
                  borderRadius: 7,
                  color: "#60a5fa",
                  cursor: "pointer",
                }}
              >
                Browse Labs <ArrowRight size={12} />
              </button>
              <NextSyncIndicator labs={labs} intervalMinutes={health?.scrape_interval_minutes ?? 60} />
            </div>
          </motion.section>
        </main>
      </div>
    </TooltipProvider>
  );
}

function NextSyncIndicator({ labs, intervalMinutes }: { labs: { last_scraped?: string | null }[]; intervalMinutes: number }) {
  const qc = useQueryClient();
  const [countdown, setCountdown] = useState("");
  const [pinOpen, setPinOpen] = useState(false);
  const [pinErrorCount, setPinErrorCount] = useState(0);

  useEffect(() => {
    const lastMs = labs
      .filter(l => l.last_scraped)
      .map(l => new Date(l.last_scraped!).getTime())
      .sort()
      .reverse()[0];
    if (!lastMs) {
      setCountdown("-");
      return;
    }
    const cycleMs = intervalMinutes * 60_000;
    const tick = () => {
      const rem = cycleMs - ((Date.now() - lastMs) % cycleMs);
      const m = Math.floor(rem / 60_000);
      const s = Math.floor((rem % 60_000) / 1000);
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
      if (data.queued) parts.push(`${data.queued} queued`);
      toast(`Sync done${parts.length ? `: ${parts.join(", ")}` : " - no changes"}`, "success");
    },
    onError: (err: unknown) => {
      const res = (err as { response?: { status?: number; data?: { detail?: string } } })?.response;
      if (res?.status === 429) {
        setPinErrorCount(n => n + 1);
        toast(res.data?.detail ?? "Too many attempts", "error");
      } else if (res?.status === 403) {
        setPinErrorCount(n => n + 1);
        toast("Wrong PIN", "error");
      } else {
        toast(`Sync failed: ${(err as Error).message}`, "error");
      }
    },
  });

  const isSyncing = syncMutation.isPending;

  return (
    <>
      {pinOpen && (
        <PinModal
          onSuccess={pin => syncMutation.mutate(pin, { onSuccess: () => setPinOpen(false) })}
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
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 13px",
              fontSize: 11,
              border: "1px solid var(--border)",
              borderRadius: 7,
              background: "transparent",
              color: isSyncing ? "#60a5fa" : "var(--text-3)",
              cursor: isSyncing ? "wait" : "pointer",
            }}
          >
            {isSyncing ? <RefreshCw size={11} style={{ animation: "spin 0.9s linear infinite" }} /> : <Clock size={11} />}
            <span>{isSyncing ? "syncing..." : "sync"}</span>
            {!isSyncing && <span style={{ fontVariantNumeric: "tabular-nums" }}>{countdown}</span>}
          </button>
        </TooltipTrigger>
        <TooltipContent>{isSyncing ? "Syncing..." : `Click to sync now - auto-syncs every ${intervalMinutes} min`}</TooltipContent>
      </Tooltip>
    </>
  );
}

const PIN_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "<", "0", "enter"];

function PinModal({ onSuccess, onClose, errorCount }: { onSuccess: (pin: string) => void; onClose: () => void; errorCount?: number }) {
  const [digits, setDigits] = useState<string[]>([]);
  const [shake, setShake] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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

  const handleKey = (key: string) => {
    if (submitted) return;
    if (key === "<") {
      setDigits(d => d.slice(0, -1));
    } else if (key === "enter") {
      if (digits.length === 4) {
        setSubmitted(true);
        onSuccess(digits.join(""));
      } else {
        triggerShake();
      }
    } else if (digits.length < 4) {
      const next = [...digits, key];
      setDigits(next);
      if (next.length === 4) {
        setSubmitted(true);
        onSuccess(next.join(""));
      }
    }
  };

  const handleKeyRef = useRef(handleKey);
  handleKeyRef.current = handleKey;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key >= "0" && event.key <= "9") handleKeyRef.current(event.key);
      else if (event.key === "Backspace") handleKeyRef.current("<");
      else if (event.key === "Enter") handleKeyRef.current("enter");
      else if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <AnimatePresence>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          background: "rgba(0,0,0,0.65)",
          backdropFilter: "blur(6px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <motion.div
          onClick={event => event.stopPropagation()}
          initial={{ opacity: 0, scale: 0.9, y: 12 }}
          animate={shake ? { opacity: 1, scale: 1, y: 0, x: [0, -10, 10, -8, 8, -4, 4, 0] } : { opacity: 1, scale: 1, y: 0, x: 0 }}
          transition={shake ? { duration: 0.45 } : { duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: "32px 28px 28px",
            width: 280,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 24,
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <p className="font-mono" style={{ fontSize: 9, letterSpacing: "0.3em", color: "var(--text-3)", textTransform: "uppercase", marginBottom: 6 }}>
              Authorization Required
            </p>
            <p className="font-mono" style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
              Enter Sync PIN
            </p>
          </div>

          <div style={{ display: "flex", gap: 14 }}>
            {[0, 1, 2, 3].map(i => (
              <motion.div
                key={i}
                animate={{ scale: digits.length === i + 1 ? [1, 1.35, 1] : 1 }}
                transition={{ duration: 0.18 }}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: i < digits.length ? "#60a5fa" : "transparent",
                  border: `2px solid ${i < digits.length ? "#60a5fa" : "rgba(255,255,255,0.2)"}`,
                  transition: "background 0.15s",
                }}
              />
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, width: "100%" }}>
            {PIN_KEYS.map(key => {
              const isAction = key === "<" || key === "enter";
              const isEnter = key === "enter";
              return (
                <button
                  key={key}
                  onClick={() => handleKey(key)}
                  className="font-mono"
                  style={{
                    height: 52,
                    borderRadius: 10,
                    border: `1px solid ${isEnter && digits.length === 4 ? "rgba(96,165,250,0.5)" : "var(--border)"}`,
                    background: isEnter && digits.length === 4 ? "rgba(96,165,250,0.15)" : isAction ? "rgba(255,255,255,0.04)" : "var(--bg)",
                    color: isAction ? "var(--text-2)" : "var(--text)",
                    fontSize: isAction ? 14 : 18,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {key === "<" ? "<" : key === "enter" ? "ok" : key}
                </button>
              );
            })}
          </div>

          <button
            onClick={onClose}
            className="font-mono"
            style={{
              fontSize: 10,
              color: "var(--text-3)",
              letterSpacing: "0.1em",
              background: "none",
              border: "none",
              cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            Cancel
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
