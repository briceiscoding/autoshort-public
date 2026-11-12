"""Claude drafts from feedback: accepting with or without keeping the current version, History labels, the saved
token turned into the right environment variable, and the current edit given back to Claude in its own format."""
import json
from pathlib import Path

import pytest

from autoshort_server import settings, store

FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "sample" / "plan.json"


@pytest.fixture
def work(tmp_path, monkeypatch):
    video = tmp_path / "short-x"
    (video / "rush").mkdir(parents=True)
    (video / "assets").mkdir()

    class Cfg:
        projects_root = tmp_path
    monkeypatch.setattr(store, "load_config", lambda: Cfg)
    plan = json.loads(FIXTURE.read_text(encoding="utf-8"))
    store.save_plan("short-x", plan)
    return video, plan


def write_draft(video: Path, plan: dict, feedback: str | None) -> None:
    draft = {**plan, "notes": "Claude proposal: fewer concepts"}
    (video / "data" / "plan.draft.json").write_text(json.dumps(draft), encoding="utf-8")
    (video / "data" / "cache").mkdir(exist_ok=True)
    (video / "data" / "cache" / "draft_request.json").write_text(json.dumps({"feedback": feedback}), encoding="utf-8")


def test_accept_keeping_the_current_version_labels_it(work):
    video, plan = work
    write_draft(video, plan, "moins de concepts")
    assert store.video_state("short-x")["draftRequest"]["feedback"] == "moins de concepts"
    store.accept_draft("short-x", keep=True)
    history = store.list_history("short-x")
    assert len(history) == 1 and history[0]["label"] == "Before Claude: moins de concepts"
    assert not (video / "data" / "plan.draft.json").exists()
    assert store.read_json(video / "data" / "plan.json")["notes"] == "Claude proposal: fewer concepts"


def test_accept_without_keeping_writes_no_snapshot(work):
    video, plan = work
    write_draft(video, plan, None)
    store.accept_draft("short-x", keep=False)
    assert store.list_history("short-x") == []
    assert store.video_state("short-x")["draftRequest"] is None


def test_token_kinds(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "SETTINGS_FILE", tmp_path / "settings.local.json")
    assert settings.claude_env() == {}
    with pytest.raises(settings.SettingsError):
        settings.set_claude_token("hello")
    settings.set_claude_token("sk-ant-oat01-" + "a" * 40)
    assert settings.claude_env() == {"CLAUDE_CODE_OAUTH_TOKEN": "sk-ant-oat01-" + "a" * 40, "ANTHROPIC_API_KEY": None}
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-api-system")
    assert "ANTHROPIC_API_KEY" not in settings.subprocess_env()
    settings.set_claude_token("sk-ant-api03-" + "b" * 40)
    assert settings.claude_env() == {"ANTHROPIC_API_KEY": "sk-ant-api03-" + "b" * 40}
    settings.set_claude_token("")
    assert settings.claude_env() == {}


def test_current_edit_round_trips_through_the_proposal_format():
    import propose_plan

    plan = json.loads(FIXTURE.read_text(encoding="utf-8"))
    current = {"cuts": [], "highlights": [], "concepts": [], "logos": [], "cutIns": [], "diagrams": [], "corrections": [],
               "subscribeWord": None, "notes": "", **propose_plan.plan_to_proposal(plan)}
    import jsonschema
    jsonschema.validate(current, propose_plan.PROPOSAL_SCHEMA)
    again = propose_plan.apply_proposal(json.loads(json.dumps(plan)), current)
    kept = lambda p: [(s["start"], s["end"], s["keep"]) for s in p["spans"]]  # noqa: E731
    assert kept(again) == kept(plan)
    assert [c["text"] for c in again["concepts"]] == [c["text"] for c in plan.get("concepts", [])]
    assert sorted(w["id"] for w in again["words"] if w.get("highlight")) == sorted(w["id"] for w in plan["words"] if w.get("highlight"))
