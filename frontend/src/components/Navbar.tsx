import { motion } from "framer-motion";
import { Link, useLocation } from "react-router-dom";

export function Navbar() {
  const { pathname } = useLocation();
  const isActive = (p: string) => pathname === p || pathname.startsWith(p + "/");

  return (
    <header style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
      height: "52px", display: "flex", alignItems: "center",
      background: "rgba(13,17,23,0.92)",
      borderBottom: "1px solid #253047",
      backdropFilter: "blur(16px)",
      WebkitBackdropFilter: "blur(16px)",
    }}>
      <div className="navbar-inner" style={{
        maxWidth: "1200px", width: "100%", margin: "0 auto",
        padding: "0 40px", display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <Link to="/dashboard" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "10px" }}>
          <div className="font-mono" style={{
            fontSize: "13px", fontWeight: 700, letterSpacing: "0.02em",
            color: "#dde5f0", padding: "4px 10px",
            background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.22)", borderRadius: "5px",
          }}>
            Ho<span style={{ color: "#f97316" }}>did</span>it
          </div>
          <span className="font-mono" style={{ fontSize: "10px", color: "#4a607a" }}>by Guy Shonshon</span>
        </Link>

        <nav style={{ display: "flex", alignItems: "center", gap: "2px" }}>
          {[{ to: "/dashboard", label: "Dashboard" }, { to: "/labs", label: "Labs" }].map(({ to, label }) => (
            <Link key={to} to={to} style={{ textDecoration: "none" }}>
              <motion.div
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                className="font-mono"
                style={{
                  padding: "5px 12px", fontSize: "11px", fontWeight: 500, borderRadius: "5px",
                  background: isActive(to) ? "rgba(59,130,246,0.1)" : "transparent",
                  border: `1px solid ${isActive(to) ? "rgba(59,130,246,0.22)" : "transparent"}`,
                  color: isActive(to) ? "#60a5fa" : "#7a8fad",
                  cursor: "pointer", transition: "color 0.15s",
                }}
              >
                {label}
              </motion.div>
            </Link>
          ))}
        </nav>

        <div className="font-mono" style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "10px", color: "#4a607a" }}>
          {import.meta.env.VITE_BUILD_NUMBER && import.meta.env.VITE_BUILD_NUMBER !== "dev" && (
            <span style={{ opacity: 0.6 }}>#{import.meta.env.VITE_BUILD_NUMBER}</span>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
            <motion.span
              style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", background: "#10b981" }}
              animate={{ opacity: [1, 0.35, 1] }}
              transition={{ duration: 2.5, repeat: Infinity }}
            />
            LIVE
          </div>
        </div>
      </div>
    </header>
  );
}
