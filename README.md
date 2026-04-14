# Floating Notes

A lightweight Obsidian plugin that opens a floating popout window for instant note capture — inspired by [Raycast Notes](https://www.raycast.com/core-features/notes).

## Why

Raycast Notes lets you jot down ideas instantly with a global hotkey and a clean, floating editor. macOS makes truly global hotkeys hard to wire up to a single Obsidian command, so this plugin combines:

- An in-app command (`Toggle floating notes`) you can bind in Obsidian's hotkey settings
- An `obsidian://floating-notes` URI handler you can trigger from Raycast / Shortcuts / Alfred for a system-wide hotkey
- A loopback HTTP endpoint (`http://127.0.0.1:51234/toggle`) for shell scripts and other tools

The result: press one hotkey from anywhere, get a distraction-free Obsidian editor floating above your work, press again to hide it.

## Features

- **Toggle popout** — show / hide a native Obsidian editor window without losing state
- **Always on top** — popout floats above other apps (optional)
- **Three capture modes**
  - **Current active note** — opens whatever note you're viewing
  - **Fixed note** — always opens a specific note (e.g. `Inbox.md`)
  - **New note every time** — creates a fresh timestamped note in a folder
- **Multiple triggers** — Obsidian command, `obsidian://floating-notes` URI, or local HTTP endpoint

## Installation

### Manual

1. Download `main.js` and `manifest.json` from the [latest release](https://github.com/haotiencheng/obsidian-floating-notes/releases)
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

1. Open Raycast → run the **Create Script Command** command
2. Fill in:
   - **Template:** `Bash`
   - **Title:** `Toggle Floating Notes`
   - **Mode:** `silent`
   - **Save Location:** any folder you like (Raycast will remember it)
3. Open the created `.sh` file and replace the body with:
   ```bash
   curl -s http://127.0.0.1:51234/toggle > /dev/null
   ```
4. Back in Raycast → search `Toggle Floating Notes` → click the gear (`⌘ ⇧ ,`) → **Record Hotkey** → press your combo

Alternatively, if you cloned this repo, point Raycast at the repo folder: **Preferences → Extensions → Script Commands → Add Directory** → pick the cloned folder. The included `floating-notes.sh` will auto-register.

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
  hs.execute("/usr/bin/curl -s http://127.0.0.1:51234/toggle")
end)
```
Reload config from the Hammerspoon menu bar icon.

**Karabiner-Elements** (free, low-level)

Complex modification JSON — import into your config:
```json
{
  "from": { "key_code": "n", "modifiers": { "mandatory": ["right_option"] } },
  "to": [{ "shell_command": "/usr/bin/curl -s http://127.0.0.1:51234/toggle" }],
  "type": "basic"
}
```

**Windows** (AutoHotkey v2)

```ahk
!n::RunWait("curl.exe -s http://127.0.0.1:51234/toggle", , "Hide")
```

**Linux** (e.g. `sxhkd`)

Add to `~/.config/sxhkd/sxhkdrc`:
```
alt + n
    curl -s http://127.0.0.1:51234/toggle > /dev/null
```

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Capture mode | What to show in the popout window | Current active note |
| Fixed note path | Path to the note (when mode is "Fixed note") | `Inbox.md` |
| New note folder | Folder for new notes (when mode is "New note every time") | `Inbox` |
| Always on top | Float popout above other windows | On |
| Server port | Local HTTP port for external triggers | `51234` |

## Notes

- **Desktop only.** The plugin uses Electron and Node `http` APIs that aren't available on Obsidian Mobile.
- The local HTTP server only accepts connections from `127.0.0.1`.

## Inspiration

[Raycast Notes](https://www.raycast.com/core-features/notes) — a beautiful, instant note-taking experience via a global hotkey. Floating Notes brings that frictionless capture workflow into Obsidian.

## License

[MIT](LICENSE)
