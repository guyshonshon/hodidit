from backend.app.scraper import _path_to_meta, infer_content_topic


def test_projects_folder_path_is_discovered_as_project_content():
    meta = _path_to_meta("projects/secure-secrets-manager.md")

    assert meta is not None
    assert meta["subcategory"] == "projects"
    assert meta["slug"] == "projects-secure-secrets-manager"
    assert meta["pages_url"].endswith("/projects/secure-secrets-manager/")


def test_project_topic_inference_uses_content_signals():
    topic = infer_content_topic(
        "Project 4: Secure Secrets Manager",
        "Build a Python Flask application with requirements.txt and routes.",
        fallback="projects",
    )

    assert topic == "python"
