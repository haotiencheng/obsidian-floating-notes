import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	WorkspaceWindow,
	normalizePath,
} from "obsidian";
import * as http from "http";

type CaptureMode = "active" | "fixed" | "new";

interface QuickCaptureSettings {
	mode: CaptureMode;
	fixedNotePath: string;
	newNoteFolder: string;
	alwaysOnTop: boolean;
	port: number;
}

const DEFAULT_SETTINGS: QuickCaptureSettings = {
	mode: "active",
	fixedNotePath: "Inbox.md",
	newNoteFolder: "Inbox",
	alwaysOnTop: true,
	port: 51234,
};

interface ElectronBrowserWindow {
	isDestroyed(): boolean;
	setSkipTaskbar(skip: boolean): void;
	setAlwaysOnTop(flag: boolean, level?: string): void;
	setOpacity(opacity: number): void;
	setIgnoreMouseEvents(ignore: boolean): void;
	focus(): void;
}

interface PopoutWindow extends Window {
	electronWindow?: ElectronBrowserWindow;
}

export default class QuickCapturePlugin extends Plugin {
	settings: QuickCaptureSettings;
	private captureWindow: WorkspaceWindow | null = null;
	private popoutBW: ElectronBrowserWindow | null = null;
	private popoutHidden = false;
	private pendingOpen = false;
	private server: http.Server | null = null;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "toggle-quick-capture",
			name: "Toggle quick capture",
			callback: () => this.toggleCapture(),
		});

		this.registerObsidianProtocolHandler("quick-capture", () => {
			this.toggleCapture();
		});

		this.startServer();

		this.registerEvent(
			this.app.workspace.on("window-open", (win: WorkspaceWindow) => {
				if (!this.pendingOpen) return;
				this.captureWindow = win;
				this.pendingOpen = false;

				const trySetup = () => {
					const bw = (win.win as PopoutWindow).electronWindow;
					if (!bw) {
						window.setTimeout(trySetup, 200);
						return;
					}
					try {
						this.popoutBW = bw;
						bw.setSkipTaskbar(true);

						if (this.settings.alwaysOnTop) {
							bw.setAlwaysOnTop(true, "floating");
						}
						bw.focus();

						win.win.document.addEventListener("keydown", (e: KeyboardEvent) => {
							if (e.key !== "Escape") return;
							const doc = win.win.document;
							const hasModal = doc.querySelector(".modal-container, .suggestion-container, .menu");
							if (hasModal) return;
							e.preventDefault();
							this.hidePopout();
						});
					} catch {
						window.setTimeout(trySetup, 200);
					}
				};
				window.setTimeout(trySetup, 100);
			})
		);

		this.registerEvent(
			this.app.workspace.on("window-close", (win: WorkspaceWindow) => {
				if (this.captureWindow === win) {
					this.resetState();
				}
			})
		);

		this.addSettingTab(new QuickCaptureSettingTab(this.app, this));
	}

	onunload() {
		this.stopServer();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private startServer() {
		this.stopServer();

		this.server = http.createServer((req, res) => {
			const remoteAddr = req.socket.remoteAddress;
			if (remoteAddr !== "127.0.0.1" && remoteAddr !== "::1" && remoteAddr !== "::ffff:127.0.0.1") {
				res.writeHead(403);
				res.end("Forbidden");
				return;
			}

			if (req.url === "/toggle") {
				this.toggleCapture();
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ ok: true }));
			} else {
				res.writeHead(404);
				res.end("Not found");
			}
		});

		this.server.keepAliveTimeout = 0;

		this.server.listen(this.settings.port, "127.0.0.1");

		this.server.on("error", (e: NodeJS.ErrnoException) => {
			if (e.code === "EADDRINUSE") {
				this.settings.port++;
				this.startServer();
			} else {
				window.setTimeout(() => this.startServer(), 1000);
			}
		});

		this.server.on("close", () => {
			if (this.server) {
				this.server = null;
				window.setTimeout(() => this.startServer(), 1000);
			}
		});
	}

	private stopServer() {
		if (this.server) {
			const s = this.server;
			this.server = null;
			s.close();
		}
	}

	private hidePopout() {
		if (this.popoutBW && !this.popoutBW.isDestroyed() && !this.popoutHidden) {
			this.popoutBW.setOpacity(0);
			this.popoutBW.setIgnoreMouseEvents(true);
			this.popoutBW.setSkipTaskbar(true);
			this.popoutHidden = true;
		}
	}

	private resetState() {
		this.captureWindow = null;
		this.popoutBW = null;
		this.popoutHidden = false;
		this.pendingOpen = false;
	}

	async toggleCapture() {
		if (this.captureWindow) {
			if (!this.popoutBW) return;
			if (this.popoutBW.isDestroyed()) {
				this.resetState();
				return;
			}
			if (!this.popoutHidden) {
				this.hidePopout();
			} else {
				this.popoutBW.setOpacity(1);
				this.popoutBW.setIgnoreMouseEvents(false);
				this.popoutBW.setSkipTaskbar(false);
				this.popoutBW.focus();
				this.popoutHidden = false;
			}
			return;
		}

		if (this.pendingOpen) return;
		this.pendingOpen = true;

		const leaf = this.app.workspace.getLeaf("window");

		if (this.settings.mode === "active") {
			const activeFile = this.app.workspace.getActiveFile();
			if (activeFile) {
				await leaf.openFile(activeFile);
			}
		} else if (this.settings.mode === "fixed") {
			const filePath = normalizePath(this.settings.fixedNotePath);
			let file = this.app.vault.getFileByPath(filePath);
			if (!file) {
				const folder = filePath.substring(0, filePath.lastIndexOf("/"));
				if (folder && !this.app.vault.getAbstractFileByPath(folder)) {
					await this.app.vault.createFolder(folder);
				}
				file = await this.app.vault.create(filePath, "");
			}
			await leaf.openFile(file);
		} else if (this.settings.mode === "new") {
			const folder = normalizePath(this.settings.newNoteFolder);
			if (!this.app.vault.getAbstractFileByPath(folder)) {
				await this.app.vault.createFolder(folder);
			}
			const title = `Quick Capture ${window.moment().format("YYYY-MM-DD HHmmss")}`;
			const file = await this.app.vault.create(normalizePath(`${folder}/${title}.md`), "");
			await leaf.openFile(file);
		}
	}
}

class QuickCaptureSettingTab extends PluginSettingTab {
	plugin: QuickCapturePlugin;

	constructor(app: App, plugin: QuickCapturePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Capture mode")
			.setDesc("What to show when opening the capture window")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("active", "Current active note")
					.addOption("fixed", "Fixed note")
					.addOption("new", "Create new note every time")
					.setValue(this.plugin.settings.mode)
					.onChange(async (value) => {
						this.plugin.settings.mode = value as CaptureMode;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		if (this.plugin.settings.mode === "fixed") {
			new Setting(containerEl)
				.setName("Fixed note path")
				.setDesc("Path to the note to always open (e.g. Inbox.md)")
				.addText((text) =>
					text
						.setPlaceholder("Inbox.md")
						.setValue(this.plugin.settings.fixedNotePath)
						.onChange(async (value) => {
							this.plugin.settings.fixedNotePath = value;
							await this.plugin.saveSettings();
						})
				);
		}

		if (this.plugin.settings.mode === "new") {
			new Setting(containerEl)
				.setName("New note folder")
				.setDesc("Folder where new capture notes are created")
				.addText((text) =>
					text
						.setPlaceholder("Inbox")
						.setValue(this.plugin.settings.newNoteFolder)
						.onChange(async (value) => {
							this.plugin.settings.newNoteFolder = value;
							await this.plugin.saveSettings();
						})
				);
		}

		new Setting(containerEl)
			.setName("Always on top")
			.setDesc("Keep the capture window floating above all other windows")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.alwaysOnTop)
					.onChange(async (value) => {
						this.plugin.settings.alwaysOnTop = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Server port")
			.setDesc("Local port for external triggers (e.g. Raycast). Restart plugin after changing.")
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.port))
					.onChange(async (value) => {
						const port = parseInt(value);
						if (!isNaN(port) && port > 1024 && port < 65535) {
							this.plugin.settings.port = port;
							await this.plugin.saveSettings();
						}
					})
			);
	}
}
