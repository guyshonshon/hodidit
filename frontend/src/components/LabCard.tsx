import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Zap } from "lucide-react";
import { Lab } from "../types";
import { StatusBadge } from "./StatusBadge";
import { CATEGORY_CONFIG } from "./CategoryChip";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/Tooltip";

interface Props { lab: Lab; index: number; }

export function LabCard({ lab, index }: Props) {
  const navigate = useNavigate();
  const displayTopic = lab.ai_topic || lab.category;
  const cfg = CATEGORY_CONFIG[displayTopic] ?? CATEGORY_CONFIG[lab.category] ?? CATEGORY_CONFIG.linux;

  // Original question text — prefer page_title (exact scraped title), fall back to title
  const originalQuestion = lab.page_title && lab.page_title !== lab.title
    ? lab.page_title
    : null;

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      onClick={() => navigate(`/labs/${lab.slug}`)}
      whileTap={{ scale: 0.985 }}
      style={{
        position: "relative",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "10px",
        padding: "18px 20px",
        cursor: "pointer",
        overflow: "hidden",
        transition: "border-color 0.2s, box-shadow 0.2s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = cfg.border;
        e.currentTarget.style.boxShadow = `0 4px 20px ${cfg.glow}`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {/* subtle category top-line */}
      <div style={{
        position: "absolute", top: 0, left: "25%", right: "25%", height: "1px",
        background: `linear-gradient(90deg, transparent, ${cfg.primary}50, transparent)`,
      }} />

      {/* row 1: category chip + dynamic badge + status */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <div className="font-mono" style={{
            display: "inline-flex", alignItems: "center", gap: "5px",
            padding: "3px 8px", fontSize: "10px", fontWeight: 600,
            letterSpacing: "0.06em", textTransform: "uppercase",
            background: cfg.bg, border: `1px solid ${cfg.border}`,
            borderRadius: "4px", color: cfg.text,
          }}>
            <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: cfg.primary, display: "inline-block" }} />
            {displayTopic}
          </div>
          {lab.is_dynamic && (
            <div title="Dynamic exercise — content is generated on demand" style={{
              display: "inline-flex", alignItems: "center",
              padding: "2px 6px", fontSize: "9px", fontWeight: 700,
              borderRadius: "4px", color: "#fbbf24",
              background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.22)",
            }}>
              <Zap size={8} />
            </div>
          )}
        </div>
        <StatusBadge status={lab.solution_status} size="xs" />
      </div>

      {/* AI-generated title */}
      <h3 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", lineHeight: 1.45, marginBottom: originalQuestion ? "5px" : "8px" }}>
        {lab.title}
      </h3>

      {/* Original question text (page_title) */}
      {originalQuestion && (
        <p className="font-mono" style={{
          fontSize: "10px", color: "var(--text-3)", lineHeight: 1.5, marginBottom: "10px",
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          {originalQuestion}
        </p>
      )}

      {/* Bottom row: subcategory + AI SUMMARY chip */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <p className="font-mono" style={{ fontSize: "10px", color: "var(--text-3)" }}>
          {lab.subcategory ?? "content"}
        </p>

        {lab.summary && (
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <span
                onClick={(e) => e.stopPropagation()}
                className="font-mono"
                style={{
                  display: "inline-flex", alignItems: "center", gap: "4px",
                  padding: "2px 7px", fontSize: "9px", fontWeight: 700,
                  letterSpacing: "0.08em", textTransform: "uppercase",
                  borderRadius: "4px", cursor: "default", flexShrink: 0,
                  color: cfg.text,
                  background: cfg.bg,
                  border: `1px solid ${cfg.border}`,
                }}
              >
                <span style={{ width: 4, height: 4, borderRadius: "50%", background: cfg.primary, display: "inline-block" }} />
                AI Summary
              </span>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              style={{
                maxWidth: 260,
                whiteSpace: "normal",
                lineHeight: 1.65,
                padding: "8px 12px",
                fontSize: "11px",
              }}
            >
              {lab.summary}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </motion.article>
  );
}
