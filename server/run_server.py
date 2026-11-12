"""Start the backend (used by start.bat)."""
import uvicorn

from autoshort_server.config import load_config

if __name__ == "__main__":
    uvicorn.run("autoshort_server.main:app", host="127.0.0.1", port=load_config().backend_port, log_level="warning")
