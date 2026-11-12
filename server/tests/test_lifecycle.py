import time

from autoshort_server import lifecycle
from autoshort_server.lifecycle import Lifecycle


def make(monkeypatch):
    monkeypatch.delenv("AUTOSHORT_AUTO_EXIT", raising=False)  # no watcher thread in tests
    return Lifecycle(on_exit=lambda: None)


def test_no_exit_before_any_window(monkeypatch):
    assert not make(monkeypatch)._should_exit()


def test_reload_within_grace_keeps_running(monkeypatch):
    lc = make(monkeypatch)
    lc.heartbeat("a")
    lc.bye("a")
    assert not lc._should_exit()  # within the grace period
    lc.heartbeat("a")  # the reloaded page is back
    lc.last_bye -= lifecycle.BYE_GRACE + 1
    assert not lc._should_exit()


def test_exit_after_last_window_closed(monkeypatch):
    lc = make(monkeypatch)
    lc.heartbeat("a")
    lc.heartbeat("b")
    lc.bye("a")
    lc.last_bye -= lifecycle.BYE_GRACE + 1
    assert not lc._should_exit()  # window b still open
    lc.bye("b")
    lc.last_bye -= lifecycle.BYE_GRACE + 1
    assert lc._should_exit()


def test_exit_when_heartbeats_stop(monkeypatch):
    lc = make(monkeypatch)
    lc.heartbeat("a")
    lc.clients["a"] = time.time() - lifecycle.STALE_AFTER - 1
    assert lc._should_exit()
