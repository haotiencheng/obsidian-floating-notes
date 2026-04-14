#!/bin/bash

# Raycast Script Command — toggles the Obsidian Floating Notes popout.
# Usable as a generic shell script too (just run it).
#
# @raycast.schemaVersion 1
# @raycast.title Toggle Floating Notes
# @raycast.mode silent
# @raycast.icon 📝
# @raycast.packageName Obsidian
# @raycast.description Toggle the Obsidian Floating Notes popout window.

curl -s http://127.0.0.1:51234/toggle > /dev/null
