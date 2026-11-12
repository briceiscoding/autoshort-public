"""AutoShort backend: projects, plans with history, media serving (Range), file intake, jobs."""
import os
import subprocess
import sys

from fastapi import Body, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse

from . import library as brand_library, store
from .config import APP, load_config
from .jobs import JobManager
from .lifecycle import Lifecycle
from .pipelines import JOB_TYPES

app = FastAPI(title="AutoShort")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
jobs = JobManager()
lifecycle = Lifecycle(on_exit=jobs.kill_all)


def fail(err: Exception, code: int = 400):
    raise HTTPException(status_code=code, detail=str(err))


@app.get("/api/health")
def health():
    return {"ok": True}


@app.post("/api/client/{client}/heartbeat")
def client_heartbeat(client: str):
    """Sent by each open window; the answer tells it whether closing it would interrupt jobs."""
    lifecycle.heartbeat(client)
    return {"busy": jobs.busy()}


@app.post("/api/client/{client}/bye")
def client_bye(client: str):
    """Beacon sent when a window is closed or reloaded; the app stops when no window is left."""
    lifecycle.bye(client)
    return {"ok": True}


@app.get("/api/config")
def config():
    cfg = load_config()
    return {"projectsRoot": str(cfg.projects_root), "libraryRoot": str(cfg.library_root), "jobTypes": sorted(JOB_TYPES)}


@app.get("/api/videos")
def videos():
    return store.list_videos()


@app.post("/api/videos")
def create_video(body: dict = Body(...)):
    try:
        return store.create_project(str(body.get("name", "")))
    except store.StoreError as err:
        fail(err)


@app.delete("/api/videos/{slug}")
def delete_video(slug: str):
    """Delete a short: its folder goes to the recycle bin. Refused while one of its jobs runs."""
    if any(j["slug"] == slug for j in jobs.busy()):
        fail(RuntimeError("a job is running for this short: wait for it or cancel it first"), 409)
    try:
        store.delete_project(slug)
    except store.StoreError as err:
        fail(err)
    return {"ok": True}


@app.put("/api/videos/{slug}/files/{kind}/{name}")
async def upload_file(slug: str, kind: str, name: str, request: Request):
    """Streamed upload of a rush or an asset dropped in the app (the body is the raw file)."""
    try:
        return await store.receive_file(slug, kind, name, request.stream())
    except store.StoreError as err:
        fail(err)


@app.post("/api/videos/{slug}/files/{kind}/copy")
def copy_file(slug: str, kind: str, body: dict = Body(...)):
    """Copy a file of this computer, given by its path, into the project."""
    try:
        return store.copy_local_file(slug, kind, str(body.get("path", "")))
    except store.StoreError as err:
        fail(err)


@app.post("/api/videos/{slug}/open-folder")
def open_folder(slug: str, sub: str = ""):
    """Show the project folder (or one of its subfolders) in the Explorer (Windows) or the Finder (macOS)."""
    try:
        folder = store.safe_child(store.video_dir(slug), sub) if sub else store.video_dir(slug)
    except store.StoreError as err:
        fail(err, 404)
    folder.mkdir(exist_ok=True)
    if os.name == "nt":
        subprocess.Popen(["explorer", str(folder)])
    elif sys.platform == "darwin":
        subprocess.Popen(["open", str(folder)])
    return {"ok": True, "folder": str(folder)}


# Folder picker run in its own process (Tk needs its own main thread); always on top of the app window.
PICK_FOLDER_TK = """
import sys, tkinter
from tkinter import filedialog
root = tkinter.Tk()
root.withdraw()
root.attributes("-topmost", True)
path = filedialog.askdirectory(parent=root, initialdir=sys.argv[1] or None, title="Export to")
print(path or "")
"""


@app.post("/api/pick-folder")
def pick_folder(body: dict = Body(default={})):
    """Open the system folder picker on this computer; returns the chosen folder, or null when cancelled."""
    initial = str(body.get("initial") or "")
    initial = initial if initial and os.path.isdir(initial) else ""
    if sys.platform == "darwin":
        script = ('on run argv\n set p to choose folder with prompt "Export to"'
                  + (' default location (POSIX file (item 1 of argv))' if initial else '') + '\n return POSIX path of p\nend run')
        done = subprocess.run(["osascript", "-e", script, initial], capture_output=True, text=True)
    else:
        done = subprocess.run([sys.executable, "-c", PICK_FOLDER_TK, initial], capture_output=True, text=True)
    path = done.stdout.strip()
    return {"path": os.path.normpath(path) if done.returncode == 0 and path else None}


@app.get("/api/videos/{slug}")
def video(slug: str):
    try:
        return store.video_state(slug)
    except store.StoreError as err:
        fail(err, 404)


@app.put("/api/videos/{slug}/plan")
def put_plan(slug: str, plan: dict = Body(...), snapshot: bool = False):
    try:
        return store.save_plan(slug, plan, snapshot)
    except store.StoreError as err:
        fail(err)


@app.get("/api/videos/{slug}/history")
def history(slug: str):
    return store.list_history(slug)


@app.get("/api/videos/{slug}/history/{name}")
def history_item(slug: str, name: str):
    try:
        return store.read_history(slug, name)
    except store.StoreError as err:
        fail(err, 404)


@app.post("/api/videos/{slug}/draft/accept")
def accept_draft(slug: str):
    try:
        return store.accept_draft(slug)
    except store.StoreError as err:
        fail(err)


@app.delete("/api/videos/{slug}/draft")
def discard_draft(slug: str):
    store.discard_draft(slug)
    return {"ok": True}


@app.get("/api/library/sfx")
def library_sfx():
    return store.list_files(load_config().library_root / "sfx")


@app.get("/api/library/fonts")
def library_fonts():
    return brand_library.list_fonts()


@app.put("/api/library/fonts/{name}")
async def upload_font(name: str, request: Request):
    """Add a font file (ttf, otf, woff, woff2) to library/fonts; the body is the raw file."""
    try:
        return {"file": brand_library.save_font(name, await request.body())}
    except brand_library.LibraryError as err:
        fail(err)


@app.post("/api/library/fonts/google")
def import_google_font(body: dict = Body(...)):
    """Download a Google Fonts family (every weight) into library/fonts."""
    try:
        return {"files": brand_library.import_google_font(str(body.get("family", "")))}
    except brand_library.LibraryError as err:
        fail(err)


@app.get("/api/library/brand-kit")
def library_brand_kit():
    """Subscribe overlay and the sound of each moment, with whether the files are in the library."""
    return brand_library.brand_kit()


@app.put("/api/library/sfx/{name}")
async def upload_sfx(name: str, request: Request, rule: str | None = None):
    """Add a sound effect to library/sfx (raw body); with ?rule=, use it for that moment in every video."""
    try:
        return {"file": brand_library.save_sfx(name, await request.body(), rule)}
    except brand_library.LibraryError as err:
        fail(err)


@app.put("/api/library/brand/subscribe/{name}")
async def upload_subscribe_overlay(name: str, request: Request):
    """Replace the subscribe reminder animation (raw body, a video on a green background)."""
    try:
        return {"file": brand_library.save_subscribe_overlay(name, await request.body())}
    except brand_library.LibraryError as err:
        fail(err)


@app.get("/api/theme")
def get_theme():
    return store.load_theme()


@app.patch("/api/theme")
def patch_theme(patch: dict = Body(...)):
    """Change the default theme of every video (theme/theme.json), e.g. a text style saved as the default."""
    try:
        return brand_library.patch_theme(patch)
    except brand_library.LibraryError as err:
        fail(err)


@app.post("/api/videos/{slug}/jobs/{job_type}")
def start_job(slug: str, job_type: str, params: dict = Body(default={})):
    if job_type not in JOB_TYPES:
        fail(ValueError(f"unknown job {job_type}"), 404)
    try:
        steps = JOB_TYPES[job_type](slug, params or {})
        return jobs.submit(slug, job_type, steps).public()
    except (store.StoreError, RuntimeError) as err:
        fail(err)


@app.get("/api/jobs")
def list_jobs(slug: str | None = None):
    return jobs.list(slug)


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    if job_id not in jobs.jobs:
        fail(KeyError(job_id), 404)
    return jobs.jobs[job_id].public(tail=400)


@app.post("/api/jobs/{job_id}/cancel")
def cancel_job(job_id: str):
    jobs.cancel(job_id)
    return {"ok": True}


@app.get("/media/{slug}/{path:path}")
def media(slug: str, path: str):
    try:
        file = store.safe_child(store.video_dir(slug), path)
    except store.StoreError as err:
        fail(err, 404)
    if not file.is_file():
        fail(FileNotFoundError(path), 404)
    return FileResponse(file, headers={"Cache-Control": "no-cache"})


@app.get("/library/{path:path}")
def library(path: str):
    try:
        file = store.safe_child(load_config().library_root, path)
    except store.StoreError as err:
        fail(err, 404)
    if not file.is_file():
        fail(FileNotFoundError(path), 404)
    return FileResponse(file, headers={"Cache-Control": "max-age=3600"})


# Production build of the front end (npm run build) served by the backend when present.
DIST = APP / "dist"


@app.get("/{path:path}", include_in_schema=False)
def front(path: str):
    if not DIST.is_dir():
        return HTMLResponse("<p>Front end not built: run the dev server (start.bat) or npm run build in app/.</p>")
    file = (DIST / path).resolve()
    if path and file.is_file() and DIST.resolve() in file.parents:
        return FileResponse(file)
    return FileResponse(DIST / "index.html")
