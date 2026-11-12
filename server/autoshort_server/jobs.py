"""Background jobs: a job is a list of steps, each one a subprocess whose output is streamed into the job log.

A step script reports progress with lines "PROGRESS <0..1> <message>". Jobs run one at a time per video.
"""
import os
import subprocess
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from .lifecycle import kill_tree, popen_group

LOG_LIMIT = 4000


@dataclass
class Step:
    name: str
    command: list[str] | None = None
    cwd: Path | None = None
    stdin: str | None = None
    env: dict | None = None
    # Python callable alternative to a command: fn(job) -> None.
    fn: Callable | None = None
    # Skip this step when the callable returns True (evaluated just before it runs).
    skip_if: Callable | None = None
    weight: float = 1.0


@dataclass
class Job:
    id: str
    slug: str
    type: str
    steps: list[Step]
    status: str = "queued"  # queued, running, done, failed, cancelled
    progress: float = 0.0
    message: str = ""
    step_index: int = 0
    logs: list[str] = field(default_factory=list)
    created: float = field(default_factory=time.time)
    finished: float | None = None
    result: dict = field(default_factory=dict)
    _process: subprocess.Popen | None = None
    _cancel: bool = False

    def log(self, line: str) -> None:
        self.logs.append(line.rstrip())
        if len(self.logs) > LOG_LIMIT:
            del self.logs[: len(self.logs) - LOG_LIMIT]

    def public(self, tail: int = 200) -> dict:
        return {
            "id": self.id, "slug": self.slug, "type": self.type, "status": self.status,
            "progress": round(self.progress, 3), "message": self.message,
            "step": self.steps[self.step_index].name if self.step_index < len(self.steps) else None,
            "steps": [s.name for s in self.steps], "stepIndex": self.step_index,
            "logs": self.logs[-tail:], "created": self.created, "finished": self.finished, "result": self.result,
        }


class JobManager:
    def __init__(self) -> None:
        self.jobs: dict[str, Job] = {}
        self.lock = threading.Lock()

    def submit(self, slug: str, job_type: str, steps: list[Step]) -> Job:
        with self.lock:
            busy = [j for j in self.jobs.values() if j.slug == slug and j.status in ("queued", "running")]
            if busy:
                raise RuntimeError(f"job {busy[0].type} already running for {slug}")
            job = Job(id=uuid.uuid4().hex[:10], slug=slug, type=job_type, steps=steps)
            self.jobs[job.id] = job
        threading.Thread(target=self._run, args=(job,), daemon=True).start()
        return job

    def cancel(self, job_id: str) -> None:
        job = self.jobs[job_id]
        job._cancel = True
        if job._process and job._process.poll() is None:
            job._process.terminate()

    def busy(self) -> list[dict]:
        return [{"slug": j.slug, "type": j.type, "progress": round(j.progress, 3)}
                for j in self.jobs.values() if j.status in ("queued", "running")]

    def kill_all(self) -> None:
        """Kill the running steps with their children (the app is closing)."""
        for job in self.jobs.values():
            job._cancel = True
            process = job._process
            if process and process.poll() is None:
                kill_tree(process.pid)

    def list(self, slug: str | None = None) -> list[dict]:
        jobs = sorted(self.jobs.values(), key=lambda j: j.created, reverse=True)
        return [j.public(tail=30) for j in jobs if slug is None or j.slug == slug][:30]

    def _run(self, job: Job) -> None:
        job.status = "running"
        total = sum(s.weight for s in job.steps) or 1
        done_weight = 0.0
        try:
            for index, step in enumerate(job.steps):
                job.step_index = index
                if job._cancel:
                    raise InterruptedError
                if step.skip_if and step.skip_if(job):
                    job.log(f"== {step.name}: skipped")
                    done_weight += step.weight
                    continue
                job.message = step.name
                job.log(f"== {step.name}")
                base = done_weight / total

                def report(fraction: float, message: str = "", _base=base, _w=step.weight) -> None:
                    job.progress = _base + max(0.0, min(1.0, fraction)) * _w / total
                    if message:
                        job.message = message

                if step.fn:
                    step.fn(job, report)
                else:
                    self._exec(job, step, report)
                done_weight += step.weight
                job.progress = done_weight / total
            job.status = "done"
            job.message = "done"
            job.progress = 1.0
        except InterruptedError:
            job.status = "cancelled"
            job.log("cancelled")
        except Exception as err:  # the job log is the place to read failures
            job.status = "failed"
            job.message = str(err)[:300]
            job.log(f"FAILED: {err}")
        finally:
            job.finished = time.time()

    def _exec(self, job: Job, step: Step, report) -> None:
        env = {**os.environ, "PYTHONUNBUFFERED": "1", "PYTHONIOENCODING": "utf-8", **(step.env or {})}
        env = {k: v for k, v in env.items() if v is not None}  # a None value in step.env removes the variable
        process = subprocess.Popen(
            step.command, cwd=step.cwd, env=env, stdin=subprocess.PIPE if step.stdin is not None else subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace",
            **popen_group(),
        )
        job._process = process
        if step.stdin is not None:
            process.stdin.write(step.stdin)
            process.stdin.close()
        for line in process.stdout:
            if line.startswith("PROGRESS "):
                parts = line.split(" ", 2)
                try:
                    report(float(parts[1]), parts[2].strip() if len(parts) > 2 else "")
                except ValueError:
                    pass
                continue
            if line.startswith("RESULT "):
                key, _, value = line[7:].strip().partition("=")
                job.result[key] = value
                continue
            job.log(line)
        code = process.wait()
        job._process = None
        if job._cancel:
            raise InterruptedError
        if code != 0:
            raise RuntimeError(f"{step.name} exited with code {code}")
