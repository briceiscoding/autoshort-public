"""Stop the app when its window is closed.

Each open window is a client: it sends a heartbeat every few seconds and a "bye" beacon when it is closed or
reloaded. When the last client has said bye (and no reload brought it back within BYE_GRACE seconds), or when no
heartbeat has come for STALE_AFTER seconds, the running jobs are killed, then the front end (Vite) and the
backend itself. Only active when the app was started by the launcher (AUTOSHORT_AUTO_EXIT=1), so a dev server is
never stopped from under the developer.
"""
import os
import re
import signal
import subprocess
import threading
import time

from .config import load_config

BYE_GRACE = 6.0
# Background windows can have their timers throttled to one per minute: stay well above that.
STALE_AFTER = 150.0


class Lifecycle:
    def __init__(self, on_exit) -> None:
        self.enabled = os.environ.get("AUTOSHORT_AUTO_EXIT") == "1"
        self.on_exit = on_exit
        self.clients: dict[str, float] = {}
        self.last_bye: float | None = None
        self.seen_client = False
        self.lock = threading.Lock()
        self.stopping = False
        if self.enabled:
            threading.Thread(target=self._watch, daemon=True).start()

    def heartbeat(self, client: str) -> None:
        with self.lock:
            self.clients[client] = time.time()
            self.seen_client = True

    def bye(self, client: str) -> None:
        with self.lock:
            self.clients.pop(client, None)
            self.last_bye = time.time()

    def _should_exit(self) -> bool:
        now = time.time()
        with self.lock:
            for client, seen in list(self.clients.items()):
                if now - seen > STALE_AFTER:
                    del self.clients[client]
            if not self.seen_client or self.clients:
                return False
            return self.last_bye is None or now - self.last_bye > BYE_GRACE

    def _watch(self) -> None:
        while True:
            time.sleep(1.0)
            if self._should_exit():
                self.stop()
                return

    def stop(self) -> None:
        if self.stopping:
            return
        self.stopping = True
        try:
            self.on_exit()
            kill_port(load_config().frontend_port)
        finally:
            os._exit(0)


NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)


def popen_group() -> dict:
    """Popen arguments so that kill_tree can later stop the process with its children."""
    return {"creationflags": NO_WINDOW} if os.name == "nt" else {"start_new_session": True}


def kill_tree(pid: int) -> None:
    """Kill a process and its children. On macOS / Linux the process must lead its own group (popen_group)."""
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True, creationflags=NO_WINDOW)
        return
    try:
        os.killpg(os.getpgid(pid), signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        try:
            os.kill(pid, signal.SIGKILL)
        except ProcessLookupError:
            pass


def listening_pids(port: int) -> set[int]:
    if os.name == "nt":
        out = subprocess.run(["netstat", "-ano", "-p", "TCP"], capture_output=True, text=True,
                             creationflags=NO_WINDOW).stdout
        return {int(m.group(1)) for m in re.finditer(rf"127\.0\.0\.1:{port}\s+\S+\s+LISTENING\s+(\d+)", out)}
    out = subprocess.run(["lsof", "-nP", "-t", f"-iTCP:{port}", "-sTCP:LISTEN"], capture_output=True, text=True).stdout
    return {int(line) for line in out.split() if line.isdigit()}


def kill_port(port: int) -> None:
    """Kill the processes listening on a local port (the Vite dev server), with their children."""
    for pid in listening_pids(port) - {0, os.getpid()}:
        if os.name == "nt":
            kill_tree(pid)
        else:  # Vite was started by start.sh in the shell's group: kill only that process
            try:
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
