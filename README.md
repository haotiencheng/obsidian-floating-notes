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

### Inside Obsidian

**Settings → Hotkeys** → search `Toggle floating notes` → bind a key. No default hotkey is set.

### Global hotkey (macOS) — Raycast (recommended)

Floating Notes exposes a local HTTP endpoint that toggles the popout **without activating the main Obsidian window**. The repo ships a ready-made Raycast Script Command:

1. In Raycast → **Preferences → Extensions → Script Commands → Add Directory** → pick the folder containing `floating-notes.sh` (e.g. where you cloned this repo)
2. Open Raycast → search `Toggle Floating Notes` → click the gear (`⌘ ⇧ ,`) → **Record Hotkey** → press your combo
3. Done. The hotkey now toggles the popout from anywhere.

### Global hotkey — other tools

All three use the same one-liner:

```bash
curl -s http://127.0.0.1:51234/toggle > /dev/null
```

- **macOS Shortcuts** — New Shortcut → action **Run Shell Script** → paste the curl → Shortcut Details → **Add Keyboard Shortcut**
- **Alfred** — Workflow → **Hotkey** trigger → **Run Script** (`/bin/bash`) → paste the curl
- **Hammerspoon** — in `~/.hammerspoon/init.lua`:
  ```lua
  hs.hotkey.bind({"alt"}, "N", function()
    hs.execute("/usr/bin/curl -s http://127.0.0.1:51234/toggle")
  end)
  ```

### Why not the URI handler?

`obsidian://floating-notes` also works, but opening a URL activates the Obsidian app — which briefly raises the main window on macOS. The HTTP endpoint bypasses app activation entirely and feels instant.

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
