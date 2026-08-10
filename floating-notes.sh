#!/bin/bash

# Raycast Script Command — toggles the Obsidian Floating Notes popout.
# Usable as a generic shell script too (just run it).
#
# If Obsidian is not running, it is launched first and the toggle is retried
# until the plugin's local server answers.
#
# Override the port with FLOATING_NOTES_PORT if you changed it in settings.
#
# @raycast.schemaVersion 1
# @raycast.title Toggle Floating Notes
# @raycast.mode silent
# @raycast.icon 📝
# @raycast.packageName Obsidian
# @raycast.description Toggle the Obsidian Floating Notes popout window.

PORT="${FLOATING_NOTES_PORT:-51234}"
URL="http://127.0.0.1:${PORT}/toggle"
LAUNCH_TIMEOUT="${FLOATING_NOTES_LAUNCH_TIMEOUT:-30}"

toggle() {
	curl -fsS --max-time 2 "$URL" > /dev/null 2>&1
}

if toggle; then
	exit 0
fi

# No answer: Obsidian is either closed or still starting. Launch it, then retry.
open -a Obsidian > /dev/null 2>&1 || open "obsidian://" > /dev/null 2>&1

deadline=$((SECONDS + LAUNCH_TIMEOUT))
while [ "$SECONDS" -lt "$deadline" ]; do
	sleep 0.5
	if toggle; then
		exit 0
	fi
done

echo "Floating Notes: no response on port ${PORT} after ${LAUNCH_TIMEOUT}s." >&2
exit 1
