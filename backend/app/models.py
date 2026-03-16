from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field, Column
import sqlalchemy as sa


class Lab(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    slug: str = Field(unique=True, index=True)
    title: str
    # page_title: exact title text as scraped from the source page (may differ from our mapping title)
    page_title: Optional[str] = Field(default=None, sa_column=Column(sa.Text, nullable=True))
    # category: the declared subject topic (linux, python, git, docker, …) — NOT the assignment type
    category: str
    subcategory: Optional[str] = None  # "labs" | "homework" | "lessons"
    url: str
    content: str = ""
    questions_raw: str = ""  # JSON string of raw questions
    # ai_topic: topic inferred by the AI from exercise content (may refine `category`)
    # e.g. a "homework" lab on Python → ai_topic = "python"
    ai_topic: Optional[str] = Field(default=None, sa_column=Column(sa.Text, nullable=True))
    # is_dynamic: True when the lab requires or used dynamic generation to reveal real content
    is_dynamic: bool = Field(default=False, sa_column=Column(sa.Boolean, nullable=False, server_default=sa.text("0")))
    discovered_at: datetime = Field(default_factory=datetime.utcnow)
    last_scraped: Optional[datetime] = None


class Solution(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    lab_slug: str = Field(index=True)
    status: str = "pending"  # "pending" | "solving" | "solved" | "failed" | "partial"

    # ── User-facing fields ─────────────────────────────────────────────────────
    # steps_json: final clean educational solution — the ONLY steps shown to users
    steps_json: str = "[]"
    summary: str = ""
    solved_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    ai_model: str = ""  # set to provider label at solve time
    execution_output: str = ""

    # ── Pipeline metadata (visible in API, not shown as solution content) ──────
    # exercise_classification: determined before solving
    exercise_classification: str = Field(
        default="normal",
        sa_column=Column(sa.Text, nullable=False, server_default=sa.text("'normal'")),
    )
    # content_was_generated: True when dynamic generation was triggered and used
    content_was_generated: bool = Field(
        default=False,
        sa_column=Column(sa.Boolean, nullable=False, server_default=sa.text("0")),
    )
    # repair_count: how many repair iterations ran (informational only, not shown in steps)
    repair_count: int = Field(
        default=0,
        sa_column=Column(sa.Integer, nullable=False, server_default=sa.text("0")),
    )
    # solve_status_detail: fine-grained outcome — "resolved" | "partial" | "unresolved" | "intentional_error_preserved"
    solve_status_detail: str = Field(
        default="",
        sa_column=Column(sa.Text, nullable=False, server_default=sa.text("''")),
    )
    # classification_reason: one-sentence reasoning from classifier (AI or pattern)
    classification_reason: str = Field(
        default="",
        sa_column=Column(sa.Text, nullable=False, server_default=sa.text("''")),
    )

    # ── Live progress log — updated during solving, included in API response ────
    # solve_log: newline-separated human-readable log of pipeline stages
    solve_log: str = Field(
        default="",
        sa_column=Column(sa.Text, nullable=False, server_default=sa.text("''")),
    )

    # ── Internal-only field — NEVER exposed in any API response ────────────────
    # internal_log: JSON array of AttemptLog dicts; stores all attempt/repair history
    # This field MUST NOT appear in _format_solution or any response schema
    internal_log: str = Field(
        default="[]",
        sa_column=Column(sa.Text, nullable=False, server_default=sa.text("'[]'")),
    )
    # prompt_used: the full prompt text sent to the AI for this solution (for reference/debugging)
    prompt_used: str = Field(
        default="",
        sa_column=Column(sa.Text, nullable=False, server_default=sa.text("''")),
    )


# Pydantic-only models (not DB tables)
class SolutionStep(SQLModel):
    id: str
    type: str  # "explanation" | "command" | "code" | "git" | "docker" | "output"
    title: str
    # description: one-sentence context shown alongside the code/command (replaces standalone explanation steps)
    description: Optional[str] = None
    content: str
    output: Optional[str] = None
    # example_inputs: variable_name → example value string, for code steps with input() calls
    # Used by the frontend to show realistic variable values and evaluate expressions correctly
    example_inputs: Optional[dict] = None
    status: str = "pending"  # "pending" | "running" | "success" | "error"
    duration_ms: Optional[int] = None
    timestamp: Optional[str] = None
    # question_ref: which question number this step answers (from AI, 1-indexed)
    question_ref: Optional[int] = None


class LabCreate(SQLModel):
    slug: str
    title: str
    category: str
    subcategory: Optional[str] = None
    url: str


class SolveRequest(SQLModel):
    lab_slug: Optional[str] = None  # deprecated; slug comes from URL path
    execute: bool = False   # if True, actually run commands in a sandbox
    force: bool = False     # if True, re-solve even if steps already exist
