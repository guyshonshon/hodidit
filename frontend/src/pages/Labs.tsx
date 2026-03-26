import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Zap, Search } from "lucide-react";
import { labsApi } from "../lib/api";
import { StatusBadge } from "../components/StatusBadge";
import { CategoryChip, getTopicConfig } from "../components/CategoryChip";
import { Category, Lab } from "../types";

const ALL_CATS: Category[] = ["linux", "git", "python", "homework"];

// ── Lab row ─────────────────────────────────────────────────────────────────

function LabRow({ lab, index }: { lab: Lab; index: number }) {
  const navigate = useNavigate();
  const displayTopic = lab.ai_topic || lab.category;
  const cfg = getTopicConfig(displayTopic);

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03, duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      onClick={() => navigate(`/labs/${lab.slug}`)}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 16px",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderLeft: `3px solid ${cfg.primary}`,
        borderRadius: "7px",
        cursor: "pointer",
        transition: "border-color 0.15s, background 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = cfg.border;
        e.currentTarget.style.background = cfg.bg;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.background = "var(--surface)";
        e.currentTarget.style.borderLeftColor = cfg.primary;
      }}
    >
      {/* Title */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", lineHeight: 1.35 }}>
          {lab.title}
        </div>
        <div className="font-mono" style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>
          {lab.slug}
        </div>
      </div>

      {/* Subcategory */}
      <span className="font-mono" style={{
        fontSize: 10, color: "var(--text-3)",
        padding: "2px 8px", borderRadius: 4,
        background: "var(--surface-2)", border: "1px solid var(--border)",
        whiteSpace: "nowrap", flexShrink: 0,
      }}>
        {lab.subcategory ?? "content"}
      </span>

      {/* Dynamic badge */}
      {lab.is_dynamic && (
        <div title="Dynamic exercise" style={{
          display: "inline-flex", alignItems: "center", gap: 3,
          padding: "2px 6px", fontSize: 9, fontWeight: 700, borderRadius: 4,
          color: "#fbbf24", background: "rgba(251,191,36,0.08)",
          border: "1px solid rgba(251,191,36,0.22)", flexShrink: 0,
        }}>
          <Zap size={8} /> dynamic
        </div>
      )}

      {/* Status */}
      <div style={{ flexShrink: 0 }}>
        <StatusBadge status={lab.solution_status} size="xs" />
      </div>
    </motion.div>
  );
}

// ── Category section ─────────────────────────────────────────────────────────

function CategorySection({ category, labs, index }: { category: string; labs: Lab[]; index: number }) {
  const cfg = getTopicConfig(category);
  const solved = labs.filter(l => l.solution_status === "solved").length;
  const solving = labs.filter(l => l.solution_status === "solving").length;
  const pct = labs.length > 0 ? Math.round((solved / labs.length) * 100) : 0;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.25 }}
    >
      {/* Section header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "14px 18px",
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        borderRadius: "10px 10px 0 0",
        borderBottom: "none",
      }}>
        {/* Color dot + label */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 10, height: 10, borderRadius: "50%",
            background: cfg.primary, display: "inline-block", flexShrink: 0,
          }} />
          <span className="font-mono" style={{
            fontSize: 13, fontWeight: 700, color: cfg.text,
            letterSpacing: "0.04em", textTransform: "uppercase",
          }}>
            {cfg.label !== "Topic" ? cfg.label : category}
          </span>
        </div>

        {/* Count */}
        <span className="font-mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
          {labs.length} {labs.length === 1 ? "item" : "items"}
        </span>

        {/* Solve status */}
        <span className="font-mono" style={{ fontSize: 11, color: solved === labs.length ? cfg.text : "var(--text-3)" }}>
          {solved}/{labs.length} solved
          {solving > 0 && <span style={{ color: "#fbbf24", marginLeft: 6 }}>· {solving} solving</span>}
        </span>

        {/* Progress bar */}
        <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2, overflow: "hidden", maxWidth: 140 }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, delay: index * 0.08, ease: [0.16, 1, 0.3, 1] }}
            style={{ height: "100%", background: cfg.primary, borderRadius: 2 }}
          />
        </div>
        <span className="font-mono" style={{ fontSize: 10, color: cfg.text, minWidth: 32 }}>{pct}%</span>
      </div>

      {/* Lab rows */}
      <div style={{
        border: `1px solid ${cfg.border}`,
        borderRadius: "0 0 10px 10px",
        overflow: "hidden",
        display: "flex", flexDirection: "column", gap: 1,
        background: "var(--bg)",
        padding: 8,
      }}>
        {labs.map((lab, i) => (
          <LabRow key={lab.slug} lab={lab} index={i} />
        ))}
      </div>
    </motion.section>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function Labs() {
  const [searchParams] = useSearchParams();
  const [filter, setFilter] = useState<string>(searchParams.get("cat") ?? "all");
  const [search, setSearch] = useState("");

  const { data: labs = [], isLoading } = useQuery({
    queryKey: ["labs"],
    queryFn: labsApi.list,
    refetchInterval: (q) => {
      const hasSolving = (q.state.data ?? []).some((l: { solution_status: string }) => l.solution_status === "solving");
      return hasSolving ? 2000 : 30_000;
    },
  });

  const filtered = labs.filter((l) => {
    const matchCat = filter === "all" || l.category === filter;
    const matchSearch = !search || l.title.toLowerCase().includes(search.toLowerCase()) || l.slug.includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  // Group by category, preserving a stable order
  const catOrder = [...new Set([...ALL_CATS, ...filtered.map(l => l.category)])];
  const grouped = catOrder
    .map(cat => ({ cat, items: filtered.filter(l => l.category === cat) }))
    .filter(g => g.items.length > 0);

  const total = labs.length;
  const solved = labs.filter(l => l.solution_status === "solved").length;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", paddingTop: "52px" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "36px 40px 64px" }}>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          style={{ marginBottom: 28 }}
        >
          <p className="font-mono" style={{
            fontSize: 10, color: "var(--text-3)", letterSpacing: "0.3em",
            textTransform: "uppercase", marginBottom: 8,
          }}>
            Lab Catalog
          </p>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>
              Browse Labs &amp; Homework
            </h1>
            <span className="font-mono" style={{ fontSize: 12, color: "var(--text-3)", paddingBottom: 2 }}>
              {solved}/{total} solved
            </span>
          </div>
        </motion.div>

        {/* Controls */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28, flexWrap: "wrap" }}
        >
          {/* Search */}
          <div style={{ position: "relative" }}>
            <Search size={12} style={{
              position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
              color: "var(--text-3)", pointerEvents: "none",
            }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search labs…"
              className="font-mono"
              style={{
                paddingLeft: 30, paddingRight: 12, paddingTop: 7, paddingBottom: 7,
                fontSize: 11, background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 6, color: "var(--text)", outline: "none", width: 190,
                transition: "border-color 0.15s",
              }}
              onFocus={(e) => { e.target.style.borderColor = "var(--border-2)"; }}
              onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
            />
          </div>

          <div style={{ width: 1, height: 20, background: "var(--border)", margin: "0 2px" }} />

          {/* Category filters */}
          <button
            onClick={() => setFilter("all")}
            className="font-mono"
            style={{
              padding: "5px 12px", fontSize: 11, borderRadius: 6, cursor: "pointer",
              border: `1px solid ${filter === "all" ? "rgba(59,130,246,0.35)" : "var(--border)"}`,
              background: filter === "all" ? "rgba(59,130,246,0.1)" : "transparent",
              color: filter === "all" ? "#60a5fa" : "var(--text-2)",
              transition: "all 0.15s",
            }}
          >
            All <span style={{ opacity: 0.5, fontSize: 10, marginLeft: 3 }}>{total}</span>
          </button>
          {ALL_CATS.map((cat) => (
            <CategoryChip
              key={cat}
              category={cat}
              active={filter === cat}
              onClick={() => setFilter(filter === cat ? "all" : cat)}
            />
          ))}
        </motion.div>

        {/* Content */}
        {isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[1, 2, 3].map((i) => (
              <motion.div
                key={i}
                style={{ height: 120, borderRadius: 10, background: "var(--surface)", border: "1px solid var(--border)" }}
                animate={{ opacity: [0.5, 0.8, 0.5] }}
                transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.2 }}
              />
            ))}
          </div>
        ) : grouped.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 0" }}>
            <p className="font-mono" style={{ fontSize: 13, color: "var(--text-2)" }}>No labs match your filter</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {grouped.map(({ cat, items }, i) => (
              <CategorySection key={cat} category={cat} labs={items} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
