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

Open **Settings → Hotkeys**, search for **Toggle floating notes**, and bind a key (no default is set).

### Global hotkey (macOS)

Pair the URI handler with a system-wide tool:

- **Raycast** — Quicklink → URL `obsidian://floating-notes` → assign hotkey
- **macOS Shortcuts** — New Shortcut → "Open URLs" → `obsidian://floating-notes` → assign keyboard shortcut
- **Alfred** — Workflow → Hotkey trigger → Run Script: `open "obsidian://floating-notes"`

A helper script `floating-notes.sh` is included that opens the URI and raises the popout window above the main Obsidian window.

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
