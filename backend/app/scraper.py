"""
GitHub-native lab scraper.

Discovers all course content by walking the GitHub repository tree directly,
fetching raw markdown/HTML files. No SITE_MAP, no HTML crawling — any new
file added to the repo appears automatically on the next sync.

Path → metadata mapping
────────────────────────
  {category}/{subcategory}/{name}.md    →  normal content (labs, lessons, …)
  homeworks/{name}.html                 →  homework exercises (HTML, may be dynamic)
  GIT/…                                 →  normalised to category="git"

Skipped:
  • Top-level files (index.md, README.md, _config.yml, …)
  • _layouts/, _includes/, assets/ directories
  • PDFs, .py, .js and other non-content file types
  • cheatsheets/ subdirectory (reference material, not exercises)
"""

import json
import re
from datetime import datetime
from typing import Optional

import httpx
from bs4 import BeautifulSoup

from .config import settings
from .models import Lab

# ── Config ─────────────────────────────────────────────────────────────────────

REPO          = settings.target_github_repo      # "hothaifa96/DevSecOps22"
BRANCH        = settings.target_github_branch    # "main"
SITE_BASE     = settings.target_site_url.rstrip("/")   # GH Pages base (for lab.url)
RAW_BASE      = f"https://raw.githubusercontent.com/{REPO}/{BRANCH}"
API_BASE      = f"https://api.github.com/repos/{REPO}"

# Only exercises — lessons/reference material are excluded
CONTENT_SUBCATEGORIES = {"labs", "homework"}
SKIP_DIRS = {"cheatsheets", "pdf", "classcode", "_layouts", "_includes", "assets"}

# HTML patterns that indicate content is behind a generate action
_GENERATE_HTML_PATTERNS = [
    r'id=["\'][^"\']*generate[^"\']*["\']',
    r'class=["\'][^"\']*generate[^"\']*["\']',
    r'onclick=["\'][^"\']*generate[^"\']*["\']',
    r'data-action=["\']generate["\']',
    r'>\s*Generate\s*(?:Exercise|Lab|Task|Question)s?\s*<',
]

_GENERATE_TEXT_PATTERNS = [
    r"click\s+(?:here\s+)?to\s+generate",
    r"press\s+(?:the\s+)?generate",
    r"generate\s+(?:your\s+)?(?:question|exercise|lab|task)",
    r"generate\s+to\s+reveal",
    r"click\s+generate",
]


# ── HTTP helpers ───────────────────────────────────────────────────────────────

def _gh_headers() -> dict:
    h = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if settings.github_token:
        h["Authorization"] = f"Bearer {settings.github_token}"
    return h


async def _gh_get(path: str) -> dict | list:
    url = f"{API_BASE}/{path.lstrip('/')}"
    async with httpx.AsyncClient(timeout=30, headers=_gh_headers()) as client:
        r = await client.get(url)
        r.raise_for_status()
        return r.json()


async def _raw_get(path: str) -> str:
    url = f"{RAW_BASE}/{path.lstrip('/')}"
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        r = await client.get(url)
        r.raise_for_status()
        return r.text


async def fetch_page(url: str) -> str:
    """Fetch an arbitrary HTML page (used for dynamic content & fallback)."""
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        r = await client.get(url)
        r.raise_for_status()
        return r.text


# ── Path → metadata ────────────────────────────────────────────────────────────

def _path_to_meta(path: str) -> Optional[dict]:
    """
    Convert a repo file path to {category, subcategory, slug, raw_path, pages_url}.
    Returns None for non-content paths.
    """
    # Skip non-content extensions
    if not re.search(r"\.(md|html?)$", path, re.I):
        return None

    parts = path.split("/")

    # Must be at least 2 levels deep (skip top-level files)
    if len(parts) < 2:
        return None

    # Skip infrastructure directories
    if any(p.startswith("_") or p in SKIP_DIRS for p in parts[:-1]):
        return None

    # ── homeworks/{name}.html ─────────────────────────────────────────────────
    if parts[0].lower() == "homeworks" and len(parts) == 2:
        stem = re.sub(r"\.(html?|md)$", "", parts[1], flags=re.I)
        # Infer subject from stem: "linux-homework" → "linux"
        category = re.sub(r"[-_]?(homework|hw|assignment).*$", "", stem, flags=re.I).lower().strip("-_") or "general"
        subcategory = "homework"
        slug = _make_slug(f"hw-{stem}")
        pages_url = f"{SITE_BASE}/homeworks/{stem}/"
        return {"category": category, "subcategory": subcategory, "slug": slug,
                "raw_path": path, "pages_url": pages_url}

    # ── {category}/{subcategory}/{name}.md ────────────────────────────────────
    if len(parts) != 3:
        return None  # too shallow (index) or too deep (sub-sub-pages)

    category   = parts[0].lower()          # GIT → git, linux → linux
    subcategory = parts[1].lower()
    stem        = re.sub(r"\.(md|html?)$", "", parts[2], flags=re.I)

    if subcategory in SKIP_DIRS or subcategory not in CONTENT_SUBCATEGORIES:
        return None

    slug = _make_slug(f"{category}-{subcategory}-{stem}")
    # Reconstruct GH Pages URL (preserves original casing for the path)
    pages_url = f"{SITE_BASE}/{parts[0]}/{parts[1]}/{stem}/"
    return {"category": category, "subcategory": subcategory, "slug": slug,
            "raw_path": path, "pages_url": pages_url}


def _make_slug(raw: str) -> str:
    s = raw.lower()
    s = re.sub(r"[^a-z0-9-]", "-", s)
    s = re.sub(r"-+", "-", s)
    return s.strip("-")


# ── GitHub tree crawler ────────────────────────────────────────────────────────

async def _list_repo_files() -> list[str]:
    """Return all blob paths from the repo tree (recursive)."""
    try:
        # Get branch HEAD SHA
        branch_data = await _gh_get(f"branches/{BRANCH}")
        sha = branch_data["commit"]["commit"]["tree"]["sha"]

        tree_data = await _gh_get(f"git/trees/{sha}?recursive=1")
        paths = [item["path"] for item in tree_data.get("tree", []) if item["type"] == "blob"]
        print(f"[scraper] GitHub tree: {len(paths)} total files in {REPO}")
        return paths
    except Exception as exc:
        print(f"[scraper] Failed to list repo files: {exc}")
        return []


# ── Content parsers ────────────────────────────────────────────────────────────

def _extract_title_from_markdown(text: str) -> Optional[str]:
    """Return the first # heading from markdown text."""
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("#"):
            return re.sub(r"^#+\s*", "", line).strip()
    return None


def _extract_title_from_html(soup: BeautifulSoup) -> Optional[str]:
    tag = soup.find("title")
    if tag and tag.get_text(strip=True):
        return tag.get_text(strip=True)
    for t in ("h1", "h2"):
        h = soup.find(t)
        if h and h.get_text(strip=True):
            return h.get_text(strip=True)
    return None


def detect_requires_generation(content: str) -> bool:
    """Return True when the content appears to require a Generate action."""
    for pat in _GENERATE_HTML_PATTERNS:
        if re.search(pat, content, re.IGNORECASE):
            return True
    text = BeautifulSoup(content, "html.parser").get_text(" ", strip=True) if "<" in content else content
    for pat in _GENERATE_TEXT_PATTERNS:
        if re.search(pat, text.lower(), re.IGNORECASE):
            return True
    return False


def _html_to_markdown(soup: BeautifulSoup) -> str:
    for pre in soup.find_all("pre"):
        code = pre.find("code")
        code_text = (code or pre).get_text()
        lang = ""
        if code and code.get("class"):
            m = re.search(r"language-(\w+)", " ".join(code["class"]))
            if m:
                lang = m.group(1)
        pre.replace_with(f"\n```{lang}\n{code_text.strip()}\n```\n\n")
    for code in soup.find_all("code"):
        code.replace_with(f"`{code.get_text(strip=True)}`")
    for tag in soup.find_all(["strong", "b"]):
        tag.replace_with(f"**{tag.get_text(strip=True)}**")
    for tag in soup.find_all(["em", "i"]):
        tag.replace_with(f"*{tag.get_text(strip=True)}*")
    for tag in soup.find_all(["h1","h2","h3","h4","h5","h6"]):
        level = int(tag.name[1])
        tag.replace_with(f"\n{'#'*level} {tag.get_text(strip=True)}\n\n")
    for li in soup.find_all("li"):
        li.replace_with(f"- {li.get_text(separator=' ', strip=True)}\n")
    for p in soup.find_all("p"):
        p.replace_with(f"{p.get_text(separator=' ', strip=True)}\n\n")
    text = soup.get_text(separator="\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def parse_content(raw: str, url: str, is_html: bool = False) -> tuple[str, str]:
    """Return (markdown_content, questions_json)."""
    if is_html:
        soup = BeautifulSoup(raw, "html.parser")
        for tag in soup.select("nav, header, footer, script, style, .sidebar"):
            tag.decompose()
        prose = soup.select_one(".prose, main, article, .content, #content") or soup.body or soup
        text = _html_to_markdown(prose)
    else:
        # Already markdown — strip Jekyll front matter (--- ... ---)
        text = re.sub(r"^---\n.*?\n---\n", "", raw, flags=re.DOTALL).strip()

    questions = extract_questions(text, url)
    return text, json.dumps(questions)


def extract_questions(text: str, url: str) -> list[dict]:
    """
    Extract numbered questions/tasks from lab content.

    Handles two layouts:
      A) Inline:  "1. Description"  /  "Task 2: Description"
      B) Header:  "**Task 1.1**"  on its own line, description on the next line(s)
                  (also handles "### Task 2.1", "**2.**", etc.)

    full_text captures everything from the question marker to the next question
    marker (in the original text), preserving code blocks and all formatting.
    """
    # Build a cleaned copy with code blocks replaced by the same number of blank
    # lines so that line numbers stay aligned with the original text.
    def _blank_fences(m: re.Match) -> str:
        return "\n" * m.group(0).count("\n")

    clean = re.sub(r"```[\s\S]*?```", _blank_fences, text)
    clean = re.sub(r"`[^`\n]+`", "", clean)

    orig_lines = text.split("\n")
    clean_lines = clean.split("\n")
    n = len(clean_lines)

    # Regex: optional markdown markers, optional keyword, mandatory number (with
    # optional sub-number like 1.1), optional separator, optional inline text.
    _TASK_RE = re.compile(
        r"^(?:[#*_]+\s*)?"                         # leading #/**/_
        r"(?:task|exercise|question|q|step|lab)?\s*"
        r"(\d+)(?:[._](\d+))?"                     # number (+ optional sub)
        r"[.):\-\s]*"                               # separator
        r"(.*?)(?:[*_#]*)\s*$",                     # optional inline text (strip trailing markers)
        re.IGNORECASE,
    )

    # First pass: locate question start lines and their headline text.
    question_starts: list[tuple[int, str]] = []  # (line_idx, headline)
    i = 0
    while i < n:
        stripped = clean_lines[i].strip()
        if not stripped:
            i += 1
            continue

        m = _TASK_RE.match(stripped)
        if m:
            inline_text = m.group(3).strip()
            consumed_until = i

            # If no inline text, look ahead for the description on subsequent lines
            if not inline_text:
                j = i + 1
                desc_parts: list[str] = []
                while j < n and len(desc_parts) < 3:
                    nl = clean_lines[j].strip()
                    nl_norm = re.sub(r"^[#*_]+\s*", "", nl)
                    if not nl:
                        if desc_parts:
                            break
                        j += 1
                        continue
                    if _TASK_RE.match(nl_norm):
                        break
                    if len(nl_norm) >= 12:
                        desc_parts.append(nl_norm)
                        consumed_until = j
                    j += 1
                inline_text = " ".join(desc_parts)

            if inline_text:
                question_starts.append((i, inline_text))
                i = consumed_until

        i += 1

    # Second pass: extract full question blocks from the original (unstripped) text.
    questions: list[dict] = []
    for idx, (start_line, headline) in enumerate(question_starts):
        end_line = question_starts[idx + 1][0] if idx + 1 < len(question_starts) else len(orig_lines)
        full_block = "\n".join(orig_lines[start_line:end_line]).strip()
        q_num = idx + 1
        questions.append({
            "id": q_num,
            "number": q_num,
            "text": headline,
            "full_text": full_block,
        })

    return questions


# ── Dynamic content (Playwright) ───────────────────────────────────────────────

async def fetch_generated_content(url: str) -> Optional[str]:
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        print("[scraper] playwright not installed — cannot fetch dynamic content")
        return None
    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
            )
            page = await browser.new_page()
            await page.goto(url, wait_until="networkidle", timeout=30_000)
            generate_selectors = [
                '#generateBtn',
                'button:has-text("Generate")', 'button:has-text("generate")',
                '[id*="generate"]', '[class*="generate-btn"]',
                '[data-action="generate"]', 'a:has-text("Generate")',
            ]
            clicked = False
            for sel in generate_selectors:
                try:
                    loc = page.locator(sel).first
                    if await loc.count() > 0:
                        await loc.click()
                        await page.wait_for_timeout(6_000)
                        clicked = True
                        break
                except Exception:
                    pass
            if not clicked:
                print(f"[scraper] No generate button found on {url}")
                await browser.close()
                return None
            print(f"[scraper] Clicked generate button on {url}, waiting for content…")
            html = await page.content()
            await browser.close()
        content, _ = parse_content(html, url, is_html=True)
        print(f"[scraper] Generated content length: {len(content.strip())} chars")
        return content if len(content.strip()) >= 150 else None
    except Exception as exc:
        print(f"[scraper] Dynamic content fetch failed for {url}: {exc}")
        return None


# ── Main discovery entry point ─────────────────────────────────────────────────

async def discover_labs() -> list[Lab]:
    """
    Walk the GitHub repo tree and return a Lab object for every content file found.
    No configuration needed — new files appear automatically on next sync.
    """
    all_paths = await _list_repo_files()
    metas = [m for p in all_paths if (m := _path_to_meta(p)) is not None]
    print(f"[scraper] {len(metas)} content file(s) identified from {len(all_paths)} repo files")

    labs: list[Lab] = []
    for meta in metas:
        raw_path = meta["raw_path"]
        pages_url = meta["pages_url"]
        is_html = raw_path.lower().endswith((".html", ".htm"))
        try:
            raw = await _raw_get(raw_path)
            content, questions_json = parse_content(raw, pages_url, is_html=is_html)
            is_dynamic = detect_requires_generation(raw)

            title = (
                (_extract_title_from_html(BeautifulSoup(raw, "html.parser")) if is_html
                 else _extract_title_from_markdown(content))
                or _slug_to_title(meta["slug"])
            )

            lab = Lab(
                slug=meta["slug"],
                title=title,
                page_title=title,
                category=meta["category"],
                subcategory=meta["subcategory"],
                url=pages_url,
                content=content,
                questions_raw=questions_json,
                is_dynamic=is_dynamic,
                last_scraped=datetime.utcnow(),
            )
            labs.append(lab)
            print(f"[scraper] ✓ {meta['slug']}  ({meta['category']}/{meta['subcategory']})")
        except Exception as exc:
            print(f"[scraper] ✗ {raw_path}: {exc}")

    print(f"[scraper] discover_labs done — {len(labs)} lab(s)")
    return labs


def _slug_to_title(slug: str) -> str:
    return slug.replace("-", " ").title()


async def refresh_lab(lab: Lab) -> Lab:
    """Re-scrape a single lab from GitHub."""
    # Derive the raw path from the pages_url
    # Try GitHub first; fall back to fetching the HTML page
    try:
        # Reconstruct raw path from slug pattern
        # slug: linux-labs-1-lab → linux/labs/1-lab.md
        # This is a best-effort reconstruction; sync via discover_labs() is more reliable
        html = await fetch_page(lab.url)
        soup = BeautifulSoup(html, "html.parser")
        lab.page_title = _extract_title_from_html(soup)
        lab.is_dynamic = detect_requires_generation(html)
        content, questions_json = parse_content(html, lab.url, is_html=True)
        lab.content = content
        lab.questions_raw = questions_json
        lab.last_scraped = datetime.utcnow()
    except Exception as exc:
        print(f"[scraper] refresh_lab failed for {lab.slug}: {exc}")
    return lab
