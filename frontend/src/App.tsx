import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Navbar } from "./components/Navbar";
import { Dashboard } from "./pages/Dashboard";
import { Labs } from "./pages/Labs";
import { LabDetail } from "./pages/LabDetail";
import { Intro } from "./pages/Intro";
import { Toaster } from "./components/ui/Toaster";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 20_000, retry: 2 } },
});

const BUILD = import.meta.env.VITE_BUILD_NUMBER;

function MainLayout() {
  return (
    <div style={{ background: "#080c18", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Navbar />
      <div style={{ flex: 1 }}>
        <Outlet />
      </div>
      {BUILD && BUILD !== "dev" && (
        <footer className="font-mono" style={{
          textAlign: "center", padding: "18px 0 14px",
          fontSize: "10px", color: "rgba(74,96,122,0.45)",
          letterSpacing: "0.06em",
        }}>
          build #{BUILD}
        </footer>
      )}
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Intro — full screen, no navbar */}
          <Route path="/" element={<Intro />} />

          {/* App shell — all inner pages share Navbar */}
          <Route element={<MainLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/labs" element={<Labs />} />
            <Route path="/labs/:slug" element={<LabDetail />} />
          </Route>
        </Routes>
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
