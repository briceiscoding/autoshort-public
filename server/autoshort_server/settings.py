"""Settings kept on this computer only: settings.local.json at the repo root (never committed).

Claude connection: the Claude Code CLI runs the plan proposals. It authenticates with, in this order:
- a token saved here: an OAuth token from `claude setup-token` (Claude Pro or Max subscription, starts with
  sk-ant-oat) is passed as CLAUDE_CODE_OAUTH_TOKEN, an API key from the Anthropic Console (pay per use, starts with
  sk-ant-api) as ANTHROPIC_API_KEY;
- otherwise the login already done with `claude` on this computer.
"""
import json
import os
import shutil
import subprocess
from pathlib import Path

from .config import REPO, load_config

SETTINGS_FILE = REPO / "settings.local.json"
OAUTH_PREFIX = "sk-ant-oat"
API_KEY_PREFIX = "sk-ant-"


class SettingsError(Exception):
    pass


def _read() -> dict:
    try:
        return json.loads(SETTINGS_FILE.read_text(encoding="utf-8")) if SETTINGS_FILE.exists() else {}
    except json.JSONDecodeError:
        return {}


def _write(data: dict) -> None:
    tmp = SETTINGS_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=1), encoding="utf-8")
    os.replace(tmp, SETTINGS_FILE)


def token_kind(token: str) -> str:
    return "subscription" if token.startswith(OAUTH_PREFIX) else "apiKey"


def claude_token() -> str:
    return str(_read().get("claudeToken") or "").strip()


def claude_env() -> dict:  # a None value removes the variable
    """Environment for a Claude Code subprocess: the saved token, else nothing (the CLI uses its own login).
    A saved subscription token must win over an ANTHROPIC_API_KEY of the system, which Claude Code would prefer."""
    token = claude_token()
    if not token:
        return {}
    if token_kind(token) == "subscription":
        return {"CLAUDE_CODE_OAUTH_TOKEN": token, "ANTHROPIC_API_KEY": None}
    return {"ANTHROPIC_API_KEY": token}


def subprocess_env() -> dict:
    env = {**os.environ, **claude_env()}
    return {k: v for k, v in env.items() if v is not None}


def set_claude_token(token: str) -> None:
    token = token.strip()
    if token and (not token.startswith(API_KEY_PREFIX) or len(token) < 30 or any(c.isspace() for c in token)):
        raise SettingsError("this does not look like a Claude token: it starts with sk-ant-oat (subscription, from "
                            "`claude setup-token`) or sk-ant-api (API key from the Anthropic Console)")
    data = _read()
    if token:
        data["claudeToken"] = token
    else:
        data.pop("claudeToken", None)
    _write(data)


def _mask(token: str) -> str:
    return f"{token[:10]}…{token[-4:]}" if len(token) > 16 else "…"


def claude_status() -> dict:
    """Is the CLI installed, and which credentials will it use (never the token itself)."""
    command = load_config().claude_command
    exe = shutil.which(command)
    version = None
    if exe:
        try:
            done = subprocess.run([exe, "--version"], capture_output=True, text=True, timeout=20, encoding="utf-8", errors="replace")
            version = (done.stdout or "").strip().splitlines()[0] if done.returncode == 0 and done.stdout.strip() else None
        except (OSError, subprocess.TimeoutExpired):
            version = None
    token = claude_token()
    return {
        "installed": bool(exe),
        "version": version,
        "command": command,
        "mode": token_kind(token) if token else "login",
        "token": _mask(token) if token else None,
        "systemApiKey": bool(os.environ.get("ANTHROPIC_API_KEY")),
    }


def test_claude() -> dict:
    """A tiny headless request, to check the connection. Costs a few tokens."""
    exe = shutil.which(load_config().claude_command)
    if not exe:
        return {"ok": False, "message": "Claude Code is not installed on this computer (npm install -g @anthropic-ai/claude-code)."}
    try:
        done = subprocess.run([exe, "-p", "--output-format", "json", "--max-turns", "1", "--disallowedTools", "Bash", "Edit", "Write"],
                              input="Reply with the single word OK.", cwd=Path.home(), env=subprocess_env(),
                              capture_output=True, text=True, timeout=120, encoding="utf-8", errors="replace")
    except subprocess.TimeoutExpired:
        return {"ok": False, "message": "Claude Code did not answer within 2 minutes."}
    try:
        envelope = json.loads(done.stdout)
    except json.JSONDecodeError:
        envelope = None
    if done.returncode != 0 or not envelope or envelope.get("is_error"):
        detail = (envelope or {}).get("result") or done.stderr or done.stdout
        return {"ok": False, "message": " ".join(str(detail).split())[:400] or f"exit code {done.returncode}"}
    return {"ok": True, "message": "Claude Code answered: the connection works."}
