import axios from "axios";
import { Lab, LabDetail, LastSolvedLab, Solution } from "../types";

const api = axios.create({
  baseURL: "/api",
  headers: import.meta.env.VITE_API_KEY
    ? { "X-API-Key": import.meta.env.VITE_API_KEY as string }
    : {},
});

export const configApi = {
  health: (): Promise<{ status: string; version: string; scrape_interval_minutes: number }> =>
    api.get("/health").then((r) => r.data),
};

export const labsApi = {
  list: (): Promise<Lab[]> => api.get("/labs/").then((r) => r.data),
  lastSolved: (): Promise<LastSolvedLab | null> => api.get("/labs/last-solved").then((r) => r.data),
  get: (slug: string): Promise<LabDetail> => api.get(`/labs/${slug}`).then((r) => r.data),
  // force=true bypasses the cache and regenerates with AI; pin required when REFORGE_PIN is set server-side
  solve: (slug: string, execute = false, force = false, pin = ""): Promise<{ message: string; solution: Solution }> =>
    api.post(`/labs/${slug}/solve`, { lab_slug: slug, execute, force, pin }).then((r) => r.data),
  replay: (slug: string): Promise<Solution> => api.post(`/labs/${slug}/replay`).then((r) => r.data),
  pushGitHub: (slug: string): Promise<{ success: boolean; pr_url?: string; message?: string }> =>
    api.post(`/labs/${slug}/push-github`).then((r) => r.data),
  sync: (pin?: string): Promise<{ added: number; updated: number }> =>
    api.post("/labs/sync", { pin: pin ?? "" }).then((r) => r.data),
  reResolveAll: (): Promise<{ cleared: number; queued: number }> =>
    api.post("/labs/admin/re-solve-all").then((r) => r.data),
};
