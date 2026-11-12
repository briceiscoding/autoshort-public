#!/bin/bash
# macOS launcher: double-click in the Finder (or drag it to the Dock) to run start.sh. The Terminal window it opens can
# be closed once the app window is up.
exec "$(dirname "$0")/../start.sh"
