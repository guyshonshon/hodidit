import { motion } from "framer-motion";
import { Category } from "../types";

type TopicConfig = {
  label: string;
  primary: string;
  text: string;
  bg: string;
  border: string;
  glow: string;
};

// Known topics — extend as new course subjects are added.
// For any topic not listed here the FALLBACK config is used automatically.
const KNOWN_TOPICS: Record<string, TopicConfig> = {
  linux: {
    label: "Linux",
    primary: "#f59e0b",
    text:    "#fbbf24",
    bg:      "rgba(245,158,11,0.1)",
    border:  "rgba(245,158,11,0.28)",
    glow:    "rgba(245,158,11,0.12)",
  },
  git: {
    label: "Git",
    primary: "#10b981",
    text:    "#34d399",
    bg:      "rgba(16,185,129,0.1)",
    border:  "rgba(16,185,129,0.28)",
    glow:    "rgba(16,185,129,0.12)",
  },
  python: {
    label: "Python",
    primary: "#3b82f6",
    text:    "#60a5fa",
    bg:      "rgba(59,130,246,0.1)",
    border:  "rgba(59,130,246,0.28)",
    glow:    "rgba(59,130,246,0.12)",
  },
  docker: {
    label: "Docker",
    primary: "#06b6d4",
    text:    "#22d3ee",
    bg:      "rgba(6,182,212,0.1)",
    border:  "rgba(6,182,212,0.28)",
    glow:    "rgba(6,182,212,0.12)",
  },
  kubernetes: {
    label: "Kubernetes",
    primary: "#6366f1",
    text:    "#818cf8",
    bg:      "rgba(99,102,241,0.1)",
    border:  "rgba(99,102,241,0.28)",
    glow:    "rgba(99,102,241,0.12)",
  },
  ansible: {
    label: "Ansible",
    primary: "#ef4444",
    text:    "#f87171",
    bg:      "rgba(239,68,68,0.1)",
    border:  "rgba(239,68,68,0.28)",
    glow:    "rgba(239,68,68,0.12)",
  },
  terraform: {
    label: "Terraform",
    primary: "#8b5cf6",
    text:    "#a78bfa",
    bg:      "rgba(139,92,246,0.1)",
    border:  "rgba(139,92,246,0.28)",
    glow:    "rgba(139,92,246,0.12)",
  },
  projects: {
    label: "Projects",
    primary: "#ec4899",
    text:    "#f472b6",
    bg:      "rgba(236,72,153,0.1)",
    border:  "rgba(236,72,153,0.28)",
    glow:    "rgba(236,72,153,0.12)",
  },
  bash: {
    label: "Bash",
    primary: "#f59e0b",
    text:    "#fbbf24",
    bg:      "rgba(245,158,11,0.1)",
    border:  "rgba(245,158,11,0.28)",
    glow:    "rgba(245,158,11,0.12)",
  },
  // "homework" kept for backward compat with old DB records
  homework: {
    label: "Homework",
    primary: "#8b5cf6",
    text:    "#a78bfa",
    bg:      "rgba(139,92,246,0.1)",
    border:  "rgba(139,92,246,0.28)",
    glow:    "rgba(139,92,246,0.12)",
  },
};

/** Generic fallback for any topic not in KNOWN_TOPICS */
const FALLBACK: TopicConfig = {
  label: "Topic",
  primary: "#64748b",
  text:    "#94a3b8",
  bg:      "rgba(100,116,139,0.1)",
  border:  "rgba(100,116,139,0.28)",
  glow:    "rgba(100,116,139,0.12)",
};

/** Get config for any topic string, with automatic fallback. */
export function getTopicConfig(topic: string): TopicConfig {
  return KNOWN_TOPICS[topic?.toLowerCase()] ?? FALLBACK;
}

/** Backward-compat export used by LabCard and LabDetail. */
export const CATEGORY_CONFIG: Record<string, TopicConfig> = new Proxy(KNOWN_TOPICS, {
  get(target, key: string) {
    return target[key] ?? FALLBACK;
  },
});

interface Props {
  category: Category;
  active?: boolean;
  onClick?: () => void;
}

export function CategoryChip({ category, active, onClick }: Props) {
  const cfg = getTopicConfig(category);
  return (
    <motion.button
      onClick={onClick}
      whileHover={onClick ? { scale: 1.03 } : {}}
      whileTap={onClick ? { scale: 0.97 } : {}}
      className="font-mono"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "5px 11px",
        fontSize: "11px",
        fontWeight: 500,
        borderRadius: "6px",
        border: `1px solid ${active ? cfg.border : "#253047"}`,
        background: active ? cfg.bg : "transparent",
        color: active ? cfg.text : "#7a8fad",
        cursor: onClick ? "pointer" : "default",
        transition: "all 0.15s",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: "6px", height: "6px", borderRadius: "50%",
          background: active ? cfg.primary : "#364a66",
          transition: "background 0.15s",
          display: "inline-block",
        }}
      />
      {cfg.label !== "Topic" ? cfg.label : category}
    </motion.button>
  );
}
