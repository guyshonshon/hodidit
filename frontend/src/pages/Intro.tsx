import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

// ── Typing sequence ──────────────────────────────────────────────────────────

const LINES: { text: string; pause?: number }[] = [
  { text: "Every child shares the same secret wish —" },
  { text: "a smarter way through the mountain of homework.", pause: 900 },
  { text: "" },
  { text: "That wish has a name now.", pause: 600 },
];

const CHAR_DELAY = 38;   // ms per character
const LINE_PAUSE = 420;  // ms between lines

// ── Blinking cursor ──────────────────────────────────────────────────────────

function Cursor({ visible }: { visible: boolean }) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const id = setInterval(() => setOn(v => !v), 530);
    return () => clearInterval(id);
  }, []);
  if (!visible) return null;
  return (
    <span style={{
      display: "inline-block", width: 2, height: "1.1em",
      background: "#f97316", marginLeft: 2, verticalAlign: "text-bottom",
      opacity: on ? 1 : 0, transition: "opacity 0.1s",
    }} />
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export function Intro() {
  const navigate = useNavigate();

  // completed lines
  const [done, setDone] = useState<string[]>([]);
  // currently typing line index and partial text
  const [lineIdx, setLineIdx] = useState(0);
  const [partial, setPartial] = useState("");
  // phases: typing | name | ready
  const [phase, setPhase] = useState<"typing" | "name" | "ready">("typing");

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (phase !== "typing") return;

    if (lineIdx >= LINES.length) {
      // All lines done → show name
      timerRef.current = setTimeout(() => setPhase("name"), 500);
      return;
    }

    const { text, pause } = LINES[lineIdx];

    if (partial.length < text.length) {
      // Type next char
      timerRef.current = setTimeout(() => {
        setPartial(text.slice(0, partial.length + 1));
      }, CHAR_DELAY);
    } else {
      // Line complete — move to next
      timerRef.current = setTimeout(() => {
        setDone(d => [...d, text]);
        setPartial("");
        setLineIdx(i => i + 1);
      }, (pause ?? 0) + LINE_PAUSE);
    }

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [phase, lineIdx, partial]);

  // After name appears, show button
  useEffect(() => {
    if (phase === "name") {
      timerRef.current = setTimeout(() => setPhase("ready"), 1200);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [phase]);

  const stillTyping = phase === "typing";

  return (
    <div style={{
      minHeight: "100vh", background: "#04070f",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "32px 20px",
    }}>

      {/* Ambient glow */}
      <div style={{
        position: "fixed", top: "30%", left: "50%", transform: "translateX(-50%)",
        width: 600, height: 300, borderRadius: "50%",
        background: "radial-gradient(ellipse, rgba(249,115,22,0.06) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <div style={{ width: "100%", maxWidth: 680, position: "relative" }}>

        {/* Terminal panel */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          style={{
            background: "rgba(8,12,26,0.95)",
            border: "1px solid rgba(249,115,22,0.18)",
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: "0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(249,115,22,0.08)",
          }}
        >
          {/* Terminal title bar */}
          <div style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "11px 16px",
            background: "rgba(255,255,255,0.025)",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}>
            {["#f87171", "#fbbf24", "#34d399"].map((c, i) => (
              <div key={i} style={{ width: 9, height: 9, borderRadius: "50%", background: c, opacity: 0.4 }} />
            ))}
            <span className="font-mono" style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", marginLeft: 6, letterSpacing: "0.05em" }}>
              hodidit — zsh
            </span>
          </div>

          {/* Terminal body */}
          <div style={{ padding: "28px 32px 36px", minHeight: 220 }}>

            {/* Prompt prefix */}
            <div className="font-mono" style={{ fontSize: 12, color: "rgba(249,115,22,0.5)", marginBottom: 18, letterSpacing: "0.05em" }}>
              ~ % hodidit --story
            </div>

            {/* Completed lines */}
            <div style={{ marginBottom: 4 }}>
              {done.map((line, i) => (
                <div key={i} className="font-mono" style={{
                  fontSize: 15, lineHeight: 1.75, color: line === "" ? undefined : "rgba(220,230,255,0.82)",
                  minHeight: line === "" ? 12 : undefined,
                  letterSpacing: "-0.01em",
                }}>
                  {line}
                </div>
              ))}
            </div>

            {/* Currently typing line */}
            {stillTyping && (
              <div className="font-mono" style={{ fontSize: 15, lineHeight: 1.75, color: "rgba(220,230,255,0.82)", letterSpacing: "-0.01em" }}>
                {partial}
                <Cursor visible />
              </div>
            )}

            {/* App name reveal */}
            <AnimatePresence>
              {phase !== "typing" && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                  style={{ marginTop: 28 }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", gap: 0, marginBottom: 6 }}>
                    <span style={{
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: 42, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1,
                      color: "#dde4f0",
                    }}>
                      Ho
                    </span>
                    <span style={{
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: 42, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1,
                      color: "#f97316",
                    }}>
                      did
                    </span>
                    <span style={{
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: 42, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1,
                      color: "#dde4f0",
                    }}>
                      it
                    </span>
                    {phase === "name" && <Cursor visible />}
                  </div>
                  <p className="font-mono" style={{
                    fontSize: 13, color: "rgba(220,230,255,0.4)",
                    letterSpacing: "0.02em", marginTop: 2,
                  }}>
                    makes that wish come true.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* CTA */}
        <AnimatePresence>
          {phase === "ready" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              style={{ marginTop: 28, display: "flex", justifyContent: "center" }}
            >
              <button
                onClick={() => navigate("/dashboard")}
                className="font-mono"
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "12px 32px", fontSize: 12, fontWeight: 700,
                  letterSpacing: "0.12em", textTransform: "uppercase",
                  background: "rgba(249,115,22,0.12)",
                  border: "1px solid rgba(249,115,22,0.4)",
                  borderRadius: 8, color: "#f97316",
                  cursor: "pointer",
                  transition: "all 0.18s",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = "rgba(249,115,22,0.2)";
                  e.currentTarget.style.borderColor = "rgba(249,115,22,0.7)";
                  e.currentTarget.style.boxShadow = "0 0 24px rgba(249,115,22,0.15)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = "rgba(249,115,22,0.12)";
                  e.currentTarget.style.borderColor = "rgba(249,115,22,0.4)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                Enter the forge
                <span style={{ fontSize: 14, opacity: 0.7 }}>→</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
