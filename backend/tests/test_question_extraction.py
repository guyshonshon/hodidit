import json

from backend.app.scraper import parse_content


def test_explicit_exercise_headings_keep_nested_lists_inside_parent():
    raw = """# Docker Lab Exercises

### Question 1

What is the main difference between a Docker image and a Docker container?

### Exercise 1: Pull and Run a Simple Image

**Task:** Pull the `hello-world` image from Docker Hub and run it.

### Exercise 2: Container Management

**Task:**

1. Run two `nginx` containers named `nginx-1` and `nginx-2`
2. List all running containers
3. Stop both containers
"""

    _, questions_raw = parse_content(raw, "https://example.test/docker/lab", is_html=False)
    questions = json.loads(questions_raw)

    assert [q["text"] for q in questions] == [
        "Question 1: What is the main difference between a Docker image and a Docker container?",
        "Exercise 1: Pull and Run a Simple Image",
        "Exercise 2: Container Management",
    ]
    assert "Run two `nginx` containers" in questions[2]["full_text"]


def test_numbered_list_fallback_preserves_inline_code_in_question_text():
    raw = """# Python Lab

1. Convert `input()` to an integer
2. Program: read `x` and print it
"""

    _, questions_raw = parse_content(raw, "https://example.test/python/lab", is_html=False)
    questions = json.loads(questions_raw)

    assert [q["text"] for q in questions] == [
        "Convert `input()` to an integer",
        "Program: read `x` and print it",
    ]


def test_project_phase_headings_become_work_items_before_numbered_lists():
    raw = """# Project 4: Secure Secrets Manager

## Description

Build a small secure secrets manager.

## Endpoints

1. POST `/secrets`
2. GET `/secrets/<id>`

## Implementation Steps

### Phase 1: Project Setup & Basic Structure

**Initialize Flask Application**

- Set up Flask project structure
- Configure virtual environment

### Phase 2: Core Secrets Management Features

**Secret Storage & Encryption**

- Encrypt secrets before storing them
"""

    _, questions_raw = parse_content(raw, "https://example.test/projects/secure-secrets-manager/", is_html=False)
    questions = json.loads(questions_raw)

    assert [q["text"] for q in questions] == [
        "Phase 1: Project Setup & Basic Structure",
        "Phase 2: Core Secrets Management Features",
    ]
    assert "POST `/secrets`" not in questions[0]["text"]
    assert "Initialize Flask Application" in questions[0]["full_text"]


def test_project_optional_choice_rule_annotates_but_solves_all_choices():
    raw = """# Python Mid Project

## Question 1: Required One
Do this.

## Question 2: Required Two
Do this too.

## Question 3: Optional Three
Maybe do this.

## Question 4: Optional Four
Maybe do this instead.

## Submission Requirements

You must solve Questions 1-2 and choose ONE of Questions 3-4.
"""

    _, questions_raw = parse_content(raw, "https://example.test/projects/python-mid-project/", is_html=False)
    questions = json.loads(questions_raw)

    selected = [q["number"] for q in questions if q["selected"]]
    assert selected == [1, 2, 3, 4]
    assert questions[2]["required"] is False
    assert questions[2]["choice_group"] == "questions_3_4"
    assert questions[3]["selected"] is True
    assert questions[3]["required"] is False


def test_project_question_keeps_challenge_inside_parent_question():
    raw = """# Python Mid Project

## Question 1: Treasure Hunt Game

**Step 1:** Create a file.

**Step 2:** Move a cursor.

**Challenge:** Maintain a leaderboard of the top 10 best results.

---

## Question 2: Get File Size

Write a function called `GetFileSize`.
"""

    _, questions_raw = parse_content(raw, "https://example.test/projects/python-mid-project/", is_html=False)
    questions = json.loads(questions_raw)

    assert [q["text"] for q in questions] == [
        "Question 1: Treasure Hunt Game",
        "Question 2: Get File Size",
    ]
    assert "Challenge" in questions[0]["full_text"]
    assert "Challenge" not in questions[1]["full_text"]
