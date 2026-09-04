# Floating Notes

[![Obsidian plugin listing](https://img.shields.io/badge/Obsidian-Floating%20Notes-7c3aed?logo=obsidian&logoColor=white)](https://community.obsidian.md/plugins/floating-notes)

A lightweight Obsidian plugin that opens a floating popout window for instant note capture — inspired by [Raycast Notes](https://www.raycast.com/core-features/notes).

Listing: **https://community.obsidian.md/plugins/floating-notes** — or [add it to Obsidian directly](obsidian://show-plugin?id=floating-notes).

## Why

Raycast Notes lets you jot down ideas instantly with a global hotkey and a clean, floating editor. macOS makes truly global hotkeys hard to wire up to a single Obsidian command, so this plugin combines:

- An in-app command (`Toggle floating notes`) you can bind in Obsidian's hotkey settings
- An `obsidian://floating-notes` URI handler you can trigger from Raycast / Shortcuts / Alfred for a system-wide hotkey
- A loopback HTTP endpoint (`http://127.0.0.1:51234/toggle`) for shell scripts and other tools

The result: press one hotkey from anywhere, get a distraction-free Obsidian editor floating above your work, press again to hide it.

## Features

- **Toggle popout** — show / hide a native Obsidian editor window without losing state
- **Always on top** — popout floats above other apps (optional)
- **Hide tab bar** — strip the tab bar for a bare capture window (optional)
- **Side panels** — two collapsible panels inside the popout, each running any installed view (file explorer, backlinks, a plugin's own sidebar view)
- **Keep the main window awake** — render plugin content (Tasks, Dataview) in the popout while the main window is minimized (optional)
- **Auto-launch** — the bundled script starts Obsidian if it isn't running, then toggles
- **Five capture modes**
  - **Current active note** — opens whatever note you're viewing
  - **Fixed note** — always opens a specific note (e.g. `Inbox.md`)
  - **New note every time** — creates a fresh timestamped note in a folder
  - **Today's daily note** — opens (or creates) today's daily note
  - **Plugin view** — opens any registered view, e.g. Journal View or Calendar
- **Multiple triggers** — Obsidian command, `obsidian://floating-notes` URI, or local HTTP endpoint

## Installation

### From the plugin store (recommended)

1. Obsidian → **Settings → Community plugins → Browse**
2. Search for **Floating Notes**
3. **Install**, then **Enable**

Or open the [listing](https://community.obsidian.md/plugins/floating-notes) in a browser and
click **Add to Obsidian**.

### Manual

1. Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/haotiencheng/obsidian-floating-notes/releases)
2. Create a folder `<your-vault>/.obsidian/plugins/floating-notes/`
3. Copy the files into that folder
4. Enable **Floating Notes** in **Settings → Community plugins**

### Build from source

```bash
git clone https://github.com/haotiencheng/obsidian-floating-notes.git
cd obsidian-floating-notes
npm install
npm run build
```

Then copy `main.js` and `manifest.json` into your vault's plugin folder.

## Usage

### In Obsidian (local hotkey)

**Settings → Hotkeys** → search `Toggle floating notes` → bind a key. No default hotkey is set.

This hotkey only fires when Obsidian is the active app. For a truly global hotkey, see below.

### Global hotkey (system-wide)

Obsidian plugins can't register OS-level hotkeys directly (the only API that allows it, `electron.remote.globalShortcut`, is deprecated and forbidden by the community plugin guidelines). The standard workaround — used by [QuickAdd](https://github.com/chhoumann/quickadd) and others — is to delegate to a system-wide launcher that triggers the plugin externally.

Floating Notes exposes two external triggers:

| Trigger | Effect |
|---|---|
| `curl -s http://127.0.0.1:51234/toggle > /dev/null` | **Recommended.** Toggles the popout without activating the Obsidian app or raising the main window. |
| `open "obsidian://floating-notes"` | Also toggles the popout, but opening an `obsidian://` URI activates the Obsidian app on macOS, which briefly raises the main window. |

Pair one of those triggers with the system-wide launcher of your choice.

#### Prerequisites

1. Floating Notes is installed and enabled in Obsidian
2. A system-wide launcher installed (Raycast, macOS Shortcuts, Alfred, Hammerspoon, Karabiner-Elements — pick one)

#### Recipes

**Raycast (macOS — recommended)**

1. Create a file named `floating-notes.sh` anywhere you like (e.g. `~/raycast-scripts/`) with this content:
   ```bash
   #!/bin/bash

   # @raycast.schemaVersion 1
   # @raycast.title Toggle Floating Notes
   # @raycast.mode silent
   # @raycast.icon 📝
   # @raycast.packageName Obsidian
   # @raycast.description Toggle the Obsidian Floating Notes popout window.

   PORT="${FLOATING_NOTES_PORT:-51234}"
   URL="http://127.0.0.1:${PORT}/toggle"

   toggle() { curl -fsS --max-time 2 "$URL" > /dev/null 2>&1; }

   toggle && exit 0

   # Obsidian is closed or still starting: launch it, then retry.
   open -a Obsidian > /dev/null 2>&1 || open "obsidian://" > /dev/null 2>&1

   deadline=$((SECONDS + 30))
   while [ "$SECONDS" -lt "$deadline" ]; do
     sleep 0.5
     toggle && exit 0
   done
   exit 1
   ```
2. Make it executable: `chmod +x ~/raycast-scripts/floating-notes.sh`
3. Raycast → **Preferences → Extensions → Script Commands → Add Directory** → pick the folder containing the script
4. Open Raycast → search `Toggle Floating Notes` → click the gear (`⌘ ⇧ ,`) → **Record Hotkey** → press your combo

If you cloned this repo, skip steps 1–2 and point Raycast at the cloned folder — `floating-notes.sh` is already there.

The macOS recipes below use a bare `curl`, which toggles only when Obsidian is already
running. For auto-launch, call the script instead of `curl`:
`~/raycast-scripts/floating-notes.sh`. Windows and Linux equivalents are further down.

**macOS Shortcuts** (built-in, no extras)

1. Shortcuts app → `+` new shortcut, name it `Floating Notes`
2. Add action **Run Shell Script** → paste:
   ```bash
   curl -s http://127.0.0.1:51234/toggle > /dev/null
   ```
3. Shortcut Details (sidebar) → **Add Keyboard Shortcut** → press key combo

**Alfred** (Powerpack required)

1. Workflows → `+` → Blank Workflow
2. Right-click canvas → Triggers → **Hotkey** → set key
3. Connect to Actions → **Run Script** (`/bin/bash`) → paste:
   ```bash
   curl -s http://127.0.0.1:51234/toggle > /dev/null
   ```

**Hammerspoon** (free, scriptable)

Add to `~/.hammerspoon/init.lua`:
```lua
hs.hotkey.bind({"alt"}, "N", function()
  -- swap for os.getenv("HOME") .. "/raycast-scripts/floating-notes.sh" to auto-launch
  hs.execute("/usr/bin/curl -s http://127.0.0.1:51234/toggle")
end)
```
Reload config from the Hammerspoon menu bar icon.

**Karabiner-Elements** (free, low-level)

Save as `~/.config/karabiner/assets/complex_modifications/floating-notes.json`, then enable it under Complex Modifications → Add predefined rule. The shell command is self-contained: it toggles the popout if Obsidian is running, otherwise launches Obsidian and retries for up to 30 seconds.
```json
{
  "title": "Floating Notes",
  "rules": [
    {
      "description": "Toggle Obsidian floating notes",
      "manipulators": [
        {
          "type": "basic",
          "from": { "key_code": "n", "modifiers": { "mandatory": ["right_option"] } },
          "to": [
            {
              "shell_command": "PORT=\"${FLOATING_NOTES_PORT:-51234}\"; URL=\"http://127.0.0.1:${PORT}/toggle\"; toggle() { curl -fsS --max-time 2 \"$URL\" > /dev/null 2>&1; }; toggle && exit 0; open -a Obsidian > /dev/null 2>&1 || open 'obsidian://' > /dev/null 2>&1; deadline=$((SECONDS + 30)); while [ \"$SECONDS\" -lt \"$deadline\" ]; do sleep 0.5; toggle && exit 0; done; exit 1"
            }
          ]
        }
      ]
    }
  ]
}
```
Karabiner rejects unknown keys such as `"//"`, so keep notes in the `description` field.

**Raycast (Windows)**

1. Create a file named `floating-notes.bat` (e.g. in `%USERPROFILE%\raycast-scripts\`) with this content:
   ```bat
   @echo off >nul 2>&1
   chcp 65001 >nul 2>&1
   setlocal

   REM @raycast.schemaVersion 1
   REM @raycast.title Toggle Floating Notes
   REM @raycast.mode silent
   REM @raycast.icon 📝
   REM @raycast.packageName Obsidian
   REM @raycast.description Toggle the Obsidian Floating Notes popout window.

   set "URL=http://127.0.0.1:51234/toggle"

   curl.exe -fsS -m 2 -o nul "%URL%" >nul 2>&1 && exit /b 0

   REM Obsidian is closed or still starting: launch it, then retry for 30s.
   start "" "obsidian://"

   for /l %%i in (1,1,30) do (
     timeout /t 1 /nobreak >nul
     curl.exe -fsS -m 2 -o nul "%URL%" >nul 2>&1 && exit /b 0
   )

   exit /b 1
   ```
2. Raycast → **Preferences → Extensions → Script Commands → Add Directory** → pick the folder containing the script
3. Open Raycast → search `Toggle Floating Notes` → assign a hotkey

**Windows** (AutoHotkey v2 — alternative to Raycast)

```ahk
!n:: {
    if Toggle()
        return
    Run("obsidian://")                      ; closed or still starting
    deadline := A_TickCount + 30000
    while (A_TickCount < deadline) {
        Sleep(500)
        if Toggle()
            return
    }
}

Toggle() {
    return RunWait('curl.exe -fsS -m 2 -o NUL "http://127.0.0.1:51234/toggle"', , "Hide") = 0
}
```

**Linux** (e.g. `sxhkd`)

Save this as `~/bin/floating-notes.sh` and `chmod +x` it:
```bash
#!/bin/sh
URL="http://127.0.0.1:${FLOATING_NOTES_PORT:-51234}/toggle"

toggle() { curl -fsS --max-time 2 "$URL" > /dev/null 2>&1; }

toggle && exit 0

# Obsidian is closed or still starting: launch it, then retry.
(obsidian > /dev/null 2>&1 &) || xdg-open "obsidian://" > /dev/null 2>&1

i=0
while [ "$i" -lt 60 ]; do
	sleep 0.5
	toggle && exit 0
	i=$((i + 1))
done
exit 1
```

Then add to `~/.config/sxhkd/sxhkdrc`:
```
alt + n
    ~/bin/floating-notes.sh
```

## Upgrading

**From 1.2.x to 1.3.x** — the plugin update is automatic, but the trigger script is not.
Your launcher runs *your own copy* of `floating-notes.sh`, so it keeps the old one-line
`curl` until you replace it. Without that, everything still works except auto-launch.

If you cloned this repo and pointed your launcher at the clone:

```bash
git pull
```

If you copied the script somewhere (e.g. `~/scripts/floating-notes.sh`), replace the body
with the current version, keeping your own `@raycast.*` metadata lines so your recorded
hotkey stays bound:

```bash
curl -fsSL https://raw.githubusercontent.com/haotiencheng/obsidian-floating-notes/main/floating-notes.sh \
  -o ~/scripts/floating-notes.sh
chmod +x ~/scripts/floating-notes.sh
```

Changed the port in settings? Export it for the script: `FLOATING_NOTES_PORT=51235`.

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Capture mode | What to show in the popout window | Current active note |
| Fixed note path | Path to the note (when mode is "Fixed note") | `Inbox.md` |
| New note folder | Folder for new notes (when mode is "New note every time") | `Inbox` |
| Capture view | Which view to open (when mode is "Plugin view"), from any installed view | none |
| Reapply capture on show | Reload the capture target every time the popout is shown, instead of keeping what was open last | Off |
| Always on top | Float popout above other windows | On |
| Hide tab bar | Hide the popout's tab bar (a 12px strip stays draggable) | Off |
| Show side panels | Collapsible panels on either side of the note in the popout | Off |
| Left / right panel view | Which view runs in each panel, from any installed view | File explorer / Backlink |
| Keep the main window awake | Stop Electron throttling the minimized main window, so plugin content still renders in the popout | Off |
| Server port | Local HTTP port for external triggers | `51234` |

## Notes

- **Desktop only.** The plugin uses Electron and Node `http` APIs that aren't available on Obsidian Mobile.
- The local HTTP server only accepts connections from `127.0.0.1`.

## Inspiration

[Raycast Notes](https://www.raycast.com/core-features/notes) — a beautiful, instant note-taking experience via a global hotkey. Floating Notes brings that frictionless capture workflow into Obsidian.

## License

[MIT](LICENSE)
