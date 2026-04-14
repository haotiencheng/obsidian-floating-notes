#!/bin/bash
# Trigger Obsidian Floating Notes without focusing the main window
# Use this script as a Raycast script command or bind to a global hotkey

open "obsidian://floating-notes"

# Wait for the popout window to appear, then hide the main Obsidian window
sleep 0.3
osascript -e '
tell application "System Events"
    tell process "Obsidian"
        set winCount to count of windows
        if winCount > 1 then
            -- The main window is usually window 1 (largest/oldest)
            -- Focus the popout (last window) and keep main hidden
            set frontmost to true
            perform action "AXRaise" of window (winCount)
        end if
    end tell
end tell
'
