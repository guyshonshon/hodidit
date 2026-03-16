from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # ── AI providers (first configured key is used) ──────────────────────────
    # Provider selector: "auto" | "openai" | "gemini"
    # - auto: openai if key exists, else gemini
    # - openai/gemini: force a specific provider
    ai_provider: str = "auto"

    # OpenAI — requires a paid API account (separate from ChatGPT Plus)
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"  # e.g. gpt-4o | gpt-4o-mini

    # Google Gemini — free tier available via aistudio.google.com
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"  # e.g. gemini-2.5-flash | gemini-2.5-pro

    # ── GitHub integration (optional) ────────────────────────────────────────
    github_token: str = ""
    github_repo: str = ""  # "username/repo-name"

    # ── Site + scraping ──────────────────────────────────────────────────────
    target_site_url: str = "https://hothaifa96.github.io/DevSecOps22/"
    # GitHub repo containing the course source files (owner/repo).
    # When set, the scraper fetches markdown directly from GitHub instead of crawling HTML.
    target_github_repo: str = "hothaifa96/DevSecOps22"
    target_github_branch: str = "main"
    scrape_interval_minutes: int = 60

    # ── Database ─────────────────────────────────────────────────────────────
    database_url: str = "sqlite:///./devops_solver.db"

    # ── API / CORS ────────────────────────────────────────────────────────────
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    # Shared secret for API access. When set, all /labs/* routes require
    # the header:  X-API-Key: <value>
    # Leave empty to disable auth (useful for local dev without a key configured).
    api_key: str = ""

    # ── Manual sync PIN ───────────────────────────────────────────────────────
    # 4-digit PIN required to trigger a manual sync from the UI.
    # Leave empty to allow unauthenticated sync (dev / no-auth mode).
    sync_pin: str = ""

    # ── Reforge PIN ───────────────────────────────────────────────────────────
    # PIN required to force-regenerate a solution via the Reforge button.
    # Leave empty to allow unauthenticated reforge (dev / no-auth mode).
    reforge_pin: str = ""

    # ── Repair loop ───────────────────────────────────────────────────────────
    # Max repair iterations after a failed execution (0 = no repair loop)
    max_repair_retries: int = 3


settings = Settings()
