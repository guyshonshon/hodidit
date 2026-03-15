export type Category = "linux" | "git" | "python" | "docker" | "kubernetes" | "ansible" | "homework" | string;
export type SolutionStatus = "unsolved" | "solving" | "solved";
export type StepType = "explanation" | "command" | "code" | "git" | "docker" | "output";
export type StepStatus = "pending" | "running" | "success" | "error";
export type ExerciseClassification =
  | "normal"
  | "requires_generation"
  | "intentional_error"
  | "ambiguous_manual_review";
export type SolveStatusDetail =
  | "resolved"
  | "repaired"
  | "partial"
  | "unresolved"
  | "intentional_error_preserved"
  | "generation_failed"
  | "ambiguous_manual_review"
  | "";

export interface Lab {
  slug: string;
  title: string;
  /** Exact page title scraped from the source page. */
  page_title: string | null;
  /** Subject topic (linux, python, git, docker, …) — never "homework". */
  category: Category;
  /** Assignment type (labs, homework, lessons). */
  subcategory: string | null;
  /** Canonical source URL. */
  url: string;
  /** True when lab requires or used dynamic content generation. */
  is_dynamic: boolean;
  /** Topic inferred by the AI from exercise content (may refine `category`). */
  ai_topic: string | null;
  solved: boolean;
  solution_status: SolutionStatus;
  /** 1-2 sentence AI-generated summary of the solution. Empty until solved. */
  summary: string;
  /** Timestamped pipeline log; populated while solving, kept after for reference. */
  solve_log: string;
  discovered_at: string;
  last_scraped: string | null;
}

export interface LabDetail extends Lab {
  content: string;
  questions: Question[];
  solution: Solution | null;
}

export interface Question {
  id: number;
  number: number;
  text: string;
  full_text: string;
}

export interface SolutionStep {
  id: string;
  type: StepType;
  title: string;
  /** One-sentence explanation shown above the code/command. */
  description?: string;
  content: string;
  output?: string;
  /** Maps variable names to example values for steps containing input() calls.
   *  Used to populate variables with real values instead of <input> placeholders. */
  example_inputs?: Record<string, string>;
  status: StepStatus;
  duration_ms?: number;
  timestamp?: string;
  /** Which question number this step answers (1-indexed, set by AI). */
  question_ref?: number;
}

export interface Solution {
  status: SolutionStatus;
  summary: string;
  steps: SolutionStep[];
  solved_at: string | null;
  /** Which AI provider/model generated this solution. */
  ai_model: string;
  exercise_classification: ExerciseClassification;
  /** One-sentence reasoning from the classifier (AI or pattern match). */
  classification_reason: string;
  content_was_generated: boolean;
  /** Internal repair count (0 = first attempt succeeded). */
  repair_count: number;
  solve_status_detail: SolveStatusDetail;
  /** Full prompt sent to the AI (for debugging/reference). */
  prompt_used: string;
  /** Timestamped pipeline log lines, visible while solving. */
  solve_log: string;
  // internal_log intentionally absent — never sent from backend.
}
