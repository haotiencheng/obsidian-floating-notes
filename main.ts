import {
	App,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	WorkspaceLeaf,
	setIcon,
	WorkspaceWindow,
	normalizePath,
} from "obsidian";
import * as http from "http";

type CaptureMode = "active" | "fixed" | "new" | "daily";

interface WindowBounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

const LEFT_PANEL_VIEW = "file-explorer";
const RIGHT_PANEL_VIEW = "backlink";

interface FloatingNotesSettings {
	mode: CaptureMode;
	fixedNotePath: string;
	newNoteFolder: string;
	alwaysOnTop: boolean;
	port: number;
	bounds: WindowBounds | null;
	opacity: number;
	hideTabBar: boolean;
	showSidePanel: boolean;
	disableBackgroundThrottling: boolean;
	leftPanelOpen: boolean;
	rightPanelOpen: boolean;
	leftPanelWidth: number;
	rightPanelWidth: number;
	leftPanelView: string;
	rightPanelView: string;
}

const DEFAULT_SETTINGS: FloatingNotesSettings = {
	mode: "active",
	fixedNotePath: "Inbox.md",
	newNoteFolder: "Inbox",
	alwaysOnTop: true,
	port: 51234,
	bounds: null,
	opacity: 1,
	hideTabBar: false,
	showSidePanel: false,
	disableBackgroundThrottling: false,
	leftPanelOpen: true,
	rightPanelOpen: true,
	leftPanelWidth: 18,
	rightPanelWidth: 18,
	leftPanelView: LEFT_PANEL_VIEW,
	rightPanelView: RIGHT_PANEL_VIEW,
};

const MIN_OPACITY = 0.2;
const MAX_OPACITY = 1;
const HIDE_TAB_BAR_CLASS = "floating-notes-no-tabs";
// Popout windows have no left/right dock (Workspace owns one of each, bound to
// the main window), so the docks here are plain leaf splits inside the popout,
// collapsed and expanded by detaching / recreating the leaf.
const DOCKS_CLASS = "floating-notes-docks";
const TOGGLE_CLASS = "floating-notes-dock-toggle";
const FIRST_HEADER_CLASS = "floating-notes-first-header";
const FIRST_BAR_CLASS = "floating-notes-first-bar";
// Views that own a file (or nothing) make no sense as a panel, and picking one
// would confuse the note leaf for a panel.
const NON_PANEL_VIEWS = new Set([
	"markdown",
	"empty",
	"canvas",
	"pdf",
	"image",
	"audio",
	"video",
	"unsupported",
	"release-notes",
]);
const MIN_PANEL_PERCENT = 8;
const MAX_PANEL_PERCENT = 50;

type DockSide = "left" | "right";

/**
 * Splits size their children with `flex-grow` via the internal setDimension,
 * which lives on the item that is the direct child of the split (the tabs
 * container), not on the leaf. Values are shared out of 100.
 */
interface SizableItem {
	containerEl?: HTMLElement;
	setDimension?(percent: number | null): void;
}

const DOCKS: Record<DockSide, { icon: string; label: string }> = {
	left: { icon: "panel-left", label: "Toggle left panel" },
	right: { icon: "panel-right", label: "Toggle right panel" },
};

interface ElectronBrowserWindow {
	isDestroyed(): boolean;
	setSkipTaskbar(skip: boolean): void;
	setAlwaysOnTop(flag: boolean, level?: string): void;
	setOpacity(opacity: number): void;
	setIgnoreMouseEvents(ignore: boolean): void;
	focus(): void;
	getBounds(): WindowBounds;
	setBounds(bounds: Partial<WindowBounds>): void;
	webContents?: { setBackgroundThrottling?(allowed: boolean): void };
	on(event: "resize" | "move" | "moved", listener: () => void): void;
	off(event: "resize" | "move" | "moved", listener: () => void): void;
}

interface PopoutWindow extends Window {
	electronWindow?: ElectronBrowserWindow;
}

export default class FloatingNotesPlugin extends Plugin {
	settings: FloatingNotesSettings;
	private captureWindow: WorkspaceWindow | null = null;
	private popoutBW: ElectronBrowserWindow | null = null;
	private popoutHidden = false;
	private pendingOpen = false;
	private server: http.Server | null = null;
	private boundsSaveTimer: number | null = null;
	private boundsListener: (() => void) | null = null;
	private trySetupTimer: number | null = null;
	private serverRetryTimer: number | null = null;
	private pendingOpenTimer: number | null = null;
	private queuedToggle = false;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "toggle-popout",
			name: "Toggle popout",
			callback: () => {
				void this.toggleCapture();
			},
		});

		this.registerObsidianProtocolHandler("floating-notes", () => {
			void this.toggleCapture();
		});

		this.startServer();
		this.applyBackgroundThrottling();

		this.registerEvent(
			this.app.workspace.on("window-open", (win: WorkspaceWindow) => {
				if (!this.pendingOpen) return;
				this.clearPendingOpen();
				this.adoptPopout(win, { restoreBounds: true, focus: true });
			})
		);

		this.registerEvent(
			this.app.workspace.on("window-close", (win: WorkspaceWindow) => {
				if (this.captureWindow === win) {
					this.resetState();
				}
			})
		);

		this.registerEvent(
			this.app.workspace.on("resize", () => {
				if (this.captureWindow) this.savePanelWidths();
			})
		);

		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				if (this.captureWindow) this.renderDockToggles();
			})
		);

		this.addSettingTab(new FloatingNotesSettingTab(this.app, this));

		// Obsidian restores popout windows from the saved layout on startup, before
		// plugins load. Adopt that window instead of opening a second one.
		this.app.workspace.onLayoutReady(() => {
			if (!this.captureWindow) {
				const restored = this.findExistingPopout();
				if (restored) {
					this.adoptPopout(restored, { restoreBounds: false, focus: false });
				}
			}
			if (this.queuedToggle) {
				this.queuedToggle = false;
				void this.toggleCapture();
			}
		});
	}

	private findExistingPopout(): WorkspaceWindow | null {
		let found: WorkspaceWindow | null = null;
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (found) return;
			const container = leaf.getContainer();
			if (container instanceof WorkspaceWindow) {
				found = container;
			}
		});
		return found;
	}

	private adoptPopout(win: WorkspaceWindow, opts: { restoreBounds: boolean; focus: boolean }) {
		this.captureWindow = win;
		if (this.trySetupTimer !== null) {
			window.clearTimeout(this.trySetupTimer);
			this.trySetupTimer = null;
		}

		const trySetup = () => {
			this.trySetupTimer = null;
			const bw = (win.win as PopoutWindow).electronWindow;
			if (!bw) {
				this.trySetupTimer = window.setTimeout(trySetup, 200);
				return;
			}
			try {
				this.popoutBW = bw;
				this.popoutHidden = false;
				bw.setSkipTaskbar(true);

				if (this.settings.alwaysOnTop) {
					bw.setAlwaysOnTop(true, "floating");
				}

				if (opts.restoreBounds && this.settings.bounds) {
					bw.setBounds(this.settings.bounds);
				}

				bw.setOpacity(this.clampedOpacity());
				bw.setIgnoreMouseEvents(false);

				this.applyTabBarSetting();
				this.applyBackgroundThrottling();
				void this.applySidePanelSetting();

				this.attachBoundsListener(bw);

				if (opts.focus) bw.focus();

				this.registerDomEvent(win.win.document, "mouseup", () => {
					this.savePanelWidths();
				});

				this.registerDomEvent(win.win.document, "keydown", (e: KeyboardEvent) => {
					if (e.key !== "Escape") return;
					const doc = win.win.document;
					const hasModal = doc.querySelector(".modal-container, .suggestion-container, .menu");
					if (hasModal) return;
					e.preventDefault();
					this.hidePopout();
				});
			} catch {
				this.trySetupTimer = window.setTimeout(trySetup, 200);
			}
		};
		this.trySetupTimer = window.setTimeout(trySetup, 100);
	}

	onunload() {
		// Hand throttling back to Electron on the way out.
		this.applyBackgroundThrottling(true);
		this.removeDockToggles();
		this.clearPendingOpen();
		if (this.trySetupTimer !== null) {
			window.clearTimeout(this.trySetupTimer);
			this.trySetupTimer = null;
		}
		if (this.boundsSaveTimer !== null) {
			window.clearTimeout(this.boundsSaveTimer);
			this.boundsSaveTimer = null;
		}
		this.stopServer();
	}

	async loadSettings() {
		const saved = (await this.loadData()) as Partial<FloatingNotesSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved ?? {});
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private clampedOpacity(): number {
		const v = this.settings.opacity;
		if (!Number.isFinite(v)) return MAX_OPACITY;
		return Math.min(MAX_OPACITY, Math.max(MIN_OPACITY, v));
	}

	applyTabBarSetting() {
		const body = this.captureWindow?.win.document.body;
		if (!body) return;
		body.classList.toggle(HIDE_TAB_BAR_CLASS, this.settings.hideTabBar);
		this.renderDockToggles();
	}

	private popoutLeaves(): WorkspaceLeaf[] {
		const win = this.captureWindow;
		const leaves: WorkspaceLeaf[] = [];
		if (!win) return leaves;
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.getContainer() === win) leaves.push(leaf);
		});
		return leaves;
	}

	panelView(side: DockSide): string {
		const type = side === "left" ? this.settings.leftPanelView : this.settings.rightPanelView;
		return type || (side === "left" ? LEFT_PANEL_VIEW : RIGHT_PANEL_VIEW);
	}

	private panelLeaf(side: DockSide): WorkspaceLeaf | null {
		const matches = this.popoutLeaves().filter((l) => l.view.getViewType() === this.panelView(side));
		if (matches.length === 0) return null;
		if (this.panelView("left") !== this.panelView("right")) return matches[0];
		// Both sides run the same view: tell them apart by position.
		const sorted = matches.sort(
			(a, b) => a.view.containerEl.getBoundingClientRect().left - b.view.containerEl.getBoundingClientRect().left
		);
		return side === "left" ? sorted[0] : sorted[sorted.length - 1];
	}

	private hostLeaf(): WorkspaceLeaf | null {
		const leaves = this.popoutLeaves();
		const panelViews = [this.panelView("left"), this.panelView("right")];
		return (
			leaves.find((l) => NON_PANEL_VIEWS.has(l.view.getViewType())) ??
			leaves.find((l) => !panelViews.includes(l.view.getViewType())) ??
			null
		);
	}

	private isOpen(side: DockSide): boolean {
		return side === "left" ? this.settings.leftPanelOpen : this.settings.rightPanelOpen;
	}

	private panelWidth(side: DockSide): number {
		const v = side === "left" ? this.settings.leftPanelWidth : this.settings.rightPanelWidth;
		if (!Number.isFinite(v)) return DEFAULT_SETTINGS.leftPanelWidth;
		return Math.min(MAX_PANEL_PERCENT, Math.max(MIN_PANEL_PERCENT, v));
	}

	/** Panels are recreated on expand, so their dragged width has to be stored. */
	private savePanelWidths() {
		const root = this.captureWindow?.win.document.querySelector(".workspace-split.mod-root") as HTMLElement | null;
		if (!root || !root.offsetWidth) return;
		let changed = false;
		for (const side of ["left", "right"] as DockSide[]) {
			const leaf = this.panelLeaf(side);
			const el = (leaf?.parent as unknown as SizableItem | undefined)?.containerEl ?? null;
			if (!el || !el.offsetWidth) continue;
			const pct = Math.round((el.offsetWidth / root.offsetWidth) * 1000) / 10;
			if (pct < MIN_PANEL_PERCENT || pct > MAX_PANEL_PERCENT) continue;
			if (side === "left") {
				if (this.settings.leftPanelWidth === pct) continue;
				this.settings.leftPanelWidth = pct;
			} else {
				if (this.settings.rightPanelWidth === pct) continue;
				this.settings.rightPanelWidth = pct;
			}
			changed = true;
		}
		if (changed) void this.saveSettings();
	}

	private setOpen(side: DockSide, open: boolean) {
		if (side === "left") this.settings.leftPanelOpen = open;
		else this.settings.rightPanelOpen = open;
	}

	/** Reconciles both docks and the toggle buttons with the current settings. */
	async applySidePanelSetting() {
		const doc = this.captureWindow?.win.document;
		if (!doc) return;
		doc.body.classList.toggle(DOCKS_CLASS, this.settings.showSidePanel);

		// Drop panels left behind by a changed view setting.
		const host = this.hostLeaf();
		const wantedViews = [this.panelView("left"), this.panelView("right")];
		for (const leaf of this.popoutLeaves()) {
			if (leaf === host) continue;
			if (!this.settings.showSidePanel || !wantedViews.includes(leaf.view.getViewType())) leaf.detach();
		}

		for (const side of ["left", "right"] as DockSide[]) {
			const existing = this.panelLeaf(side);
			const wanted = this.settings.showSidePanel && this.isOpen(side);
			if (wanted && !existing) await this.openPanel(side);
			else if (!wanted && existing) {
				this.savePanelWidths();
				existing.detach();
			}
		}

		// Detaching hands the freed space to the sibling split, so resize the
		// remaining columns back to the note leaf.
		this.applyPanelWidths();
		this.renderDockToggles();
	}

	async toggleDock(side: DockSide) {
		this.setOpen(side, !this.isOpen(side));
		await this.saveSettings();
		await this.applySidePanelSetting();
	}

	private async openPanel(side: DockSide) {
		const host = this.hostLeaf();
		if (!host) return;
		const leaf = this.app.workspace.createLeafBySplit(host, "vertical", side === "left");
		await leaf.setViewState({ type: this.panelView(side) });
		this.applyPanelWidths();
		this.app.workspace.setActiveLeaf(host, { focus: true });
	}

	private applyPanelWidths() {
		const host = this.hostLeaf();
		if (!host) return;
		const hostTabs = host.parent as unknown as SizableItem | undefined;
		const split = (host.parent as unknown as { parent?: { children?: SizableItem[] } })?.parent;
		const children = split?.children;
		if (!children || !hostTabs) return;

		const tabsFor = (side: DockSide) => this.panelLeaf(side)?.parent as unknown as SizableItem | undefined;
		const left = tabsFor("left");
		const right = tabsFor("right");
		const leftPct = left ? this.panelWidth("left") : 0;
		const rightPct = right ? this.panelWidth("right") : 0;
		const hostPct = Math.max(MIN_PANEL_PERCENT, 100 - leftPct - rightPct);

		for (const child of children) {
			const pct = child === left ? leftPct : child === right ? rightPct : hostPct;
			try {
				child.setDimension?.(pct);
			} catch {
				/* ignore */
			}
		}
	}

	/**
	 * The toggles mount in the tab header container of the outermost columns.
	 * With "Hide tab bar" on that container is emptied down to a thin drag
	 * strip (see styles.css) rather than removed, so the mount point is the
	 * same in both states.
	 */
	private renderDockToggles() {
		const doc = this.captureWindow?.win.document;
		if (!doc) return;
		this.removeDockToggles();
		this.markFirstHeader();
		if (!this.settings.showSidePanel) return;

		for (const side of ["left", "right"] as DockSide[]) {
			const leaf = this.panelLeaf(side) ?? this.hostLeaf();
			if (!leaf) continue;
			const bar = leaf.view.containerEl
				.closest(".workspace-tabs")
				?.querySelector(".workspace-tab-header-container");
			if (!bar) continue;

			// Plain DOM here: the element belongs to the popout document.
			const btn = doc.createElement("button");
			btn.className = `${TOGGLE_CLASS} clickable-icon mod-${side}`;
			btn.setAttribute("aria-label", DOCKS[side].label);
			btn.classList.toggle("is-collapsed", !this.isOpen(side));
			setIcon(btn, DOCKS[side].icon);
			this.registerDomEvent(btn, "click", () => {
				void this.toggleDock(side);
			});

			if (side === "left") {
				bar.classList.add(FIRST_BAR_CLASS);
				bar.prepend(btn);
			}
			else bar.appendChild(btn);
		}
	}

	/**
	 * With the tab bar hidden the view header becomes the top row, so only the
	 * leftmost column has to clear the macOS traffic lights.
	 */
	private markFirstHeader() {
		const doc = this.captureWindow?.win.document;
		if (!doc) return;
		doc.querySelectorAll(`.${FIRST_HEADER_CLASS}`).forEach((el) => el.classList.remove(FIRST_HEADER_CLASS));
		// With panels on, the drag strip sits above the headers instead.
		if (this.settings.showSidePanel) return;
		const leaf = this.panelLeaf("left") ?? this.hostLeaf();
		leaf?.view.containerEl.querySelector(".view-header")?.classList.add(FIRST_HEADER_CLASS);
	}

	private removeDockToggles() {
		const doc = this.captureWindow?.win.document;
		if (!doc) return;
		doc.querySelectorAll(`.${TOGGLE_CLASS}`).forEach((el) => el.remove());
		doc.querySelectorAll(`.${FIRST_BAR_CLASS}`).forEach((el) => el.classList.remove(FIRST_BAR_CLASS));
	}

	/**
	 * Electron throttles timers and rendering in a minimized window. Plugin
	 * code runs in the main window, so anything it renders into the popout
	 * (Tasks queries, Dataview blocks) stalls while the main window is down.
	 */
	applyBackgroundThrottling(forceAllowed = false) {
		const allowed = forceAllowed || !this.settings.disableBackgroundThrottling;
		const mainBW = (window as PopoutWindow).electronWindow;
		for (const bw of [mainBW, this.popoutBW]) {
			if (!bw) continue;
			try {
				if (bw.isDestroyed()) continue;
				bw.webContents?.setBackgroundThrottling?.(allowed);
			} catch {
				/* ignore */
			}
		}
	}

	applyOpacity() {
		if (!this.popoutBW || this.popoutBW.isDestroyed()) return;
		if (this.popoutHidden) return;
		this.popoutBW.setOpacity(this.clampedOpacity());
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
				void this.toggleCapture();
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
				void this.saveSettings();
				new Notice(`Floating Notes: port in use, switched to ${this.settings.port}`);
				this.startServer();
		this.applyBackgroundThrottling();
			} else {
				this.serverRetryTimer = window.setTimeout(() => {
					this.serverRetryTimer = null;
					this.startServer();
		this.applyBackgroundThrottling();
				}, 1000);
			}
		});

		this.server.on("close", () => {
			if (this.server) {
				this.server = null;
				this.serverRetryTimer = window.setTimeout(() => {
					this.serverRetryTimer = null;
					this.startServer();
		this.applyBackgroundThrottling();
				}, 1000);
			}
		});
	}

	private stopServer() {
		if (this.serverRetryTimer !== null) {
			window.clearTimeout(this.serverRetryTimer);
			this.serverRetryTimer = null;
		}
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

	private showPopout() {
		if (!this.popoutBW || this.popoutBW.isDestroyed()) return;
		this.popoutBW.setOpacity(this.clampedOpacity());
		this.popoutBW.setIgnoreMouseEvents(false);
		this.popoutBW.setSkipTaskbar(false);
		this.popoutBW.focus();
		this.popoutHidden = false;
	}

	private clearPendingOpen() {
		if (this.pendingOpenTimer !== null) {
			window.clearTimeout(this.pendingOpenTimer);
			this.pendingOpenTimer = null;
		}
		this.pendingOpen = false;
	}

	private resetState() {
		this.detachBoundsListener();
		this.removeDockToggles();
		this.captureWindow = null;
		this.popoutBW = null;
		this.popoutHidden = false;
		this.clearPendingOpen();
	}

	private attachBoundsListener(bw: ElectronBrowserWindow) {
		const handler = () => {
			if (this.boundsSaveTimer !== null) {
				window.clearTimeout(this.boundsSaveTimer);
			}
			this.boundsSaveTimer = window.setTimeout(() => {
				this.boundsSaveTimer = null;
				if (!this.popoutBW || this.popoutBW.isDestroyed()) return;
				if (this.popoutHidden) return;
				const b = this.popoutBW.getBounds();
				this.settings.bounds = { x: b.x, y: b.y, width: b.width, height: b.height };
				void this.saveSettings();
			}, 400);
		};
		this.boundsListener = handler;
		bw.on("resize", handler);
		bw.on("moved", handler);
	}

	private detachBoundsListener() {
		if (this.boundsSaveTimer !== null) {
			window.clearTimeout(this.boundsSaveTimer);
			this.boundsSaveTimer = null;
			if (this.popoutBW && !this.popoutBW.isDestroyed() && !this.popoutHidden) {
				try {
					const b = this.popoutBW.getBounds();
					this.settings.bounds = { x: b.x, y: b.y, width: b.width, height: b.height };
					void this.saveSettings();
				} catch {
					/* ignore */
				}
			}
		}
		if (this.popoutBW && this.boundsListener && !this.popoutBW.isDestroyed()) {
			try {
				this.popoutBW.off("resize", this.boundsListener);
				this.popoutBW.off("moved", this.boundsListener);
			} catch {
				/* ignore */
			}
		}
		this.boundsListener = null;
	}

	private async resolveDailyNote() {
		const internal = (this.app as unknown as {
			internalPlugins: { getPluginById(id: string): { instance?: { options?: { folder?: string; format?: string; template?: string } } } | null };
		}).internalPlugins.getPluginById("daily-notes");
		const opts = internal?.instance?.options ?? {};
		const format = opts.format || "YYYY-MM-DD";
		const folder = opts.folder || "";
		const filename = window.moment().format(format);
		const path = normalizePath(folder ? `${folder}/${filename}.md` : `${filename}.md`);
		let file = this.app.vault.getFileByPath(path);
		if (!file) {
			const dir = path.substring(0, path.lastIndexOf("/"));
			if (dir && !this.app.vault.getAbstractFileByPath(dir)) {
				await this.app.vault.createFolder(dir);
			}
			let body = "";
			if (opts.template) {
				const tplPath = normalizePath(opts.template.endsWith(".md") ? opts.template : `${opts.template}.md`);
				const tpl = this.app.vault.getFileByPath(tplPath);
				if (tpl) body = await this.app.vault.read(tpl);
			}
			file = await this.app.vault.create(path, body);
		}
		return file;
	}

	async toggleCapture() {
		// A trigger can arrive while Obsidian is still starting up (the local
		// server is listening before the workspace exists). Run it once ready.
		if (!this.app.workspace.layoutReady) {
			this.queuedToggle = true;
			return;
		}

		if (this.captureWindow) {
			if (!this.popoutBW) return;
			if (this.popoutBW.isDestroyed()) {
				this.resetState();
				return;
			}
			if (!this.popoutHidden) {
				this.hidePopout();
			} else {
				this.showPopout();
			}
			return;
		}

		if (this.pendingOpen) return;
		this.pendingOpen = true;
		// Safety net: if "window-open" never arrives, do not block future toggles.
		this.pendingOpenTimer = window.setTimeout(() => {
			this.pendingOpenTimer = null;
			this.pendingOpen = false;
		}, 5000);

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
		} else if (this.settings.mode === "daily") {
			const file = await this.resolveDailyNote();
			if (file) await leaf.openFile(file);
		} else if (this.settings.mode === "new") {
			const folder = normalizePath(this.settings.newNoteFolder);
			if (!this.app.vault.getAbstractFileByPath(folder)) {
				await this.app.vault.createFolder(folder);
			}
			const title = `Floating Note ${window.moment().format("YYYY-MM-DD HHmmss")}`;
			const file = await this.app.vault.create(normalizePath(`${folder}/${title}.md`), "");
			await leaf.openFile(file);
		}

		await this.applySidePanelSetting();
	}
}

class FloatingNotesSettingTab extends PluginSettingTab {
	plugin: FloatingNotesPlugin;

	constructor(app: App, plugin: FloatingNotesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/** Every registered view, minus the ones that hold a file. */
	private panelViewOptions(): Record<string, string> {
		const registry = (this.app as unknown as { viewRegistry?: { viewByType?: Record<string, unknown> } })
			.viewRegistry?.viewByType;
		const types = Object.keys(registry ?? {}).filter((t) => !NON_PANEL_VIEWS.has(t));
		for (const fallback of [LEFT_PANEL_VIEW, RIGHT_PANEL_VIEW]) {
			if (!types.includes(fallback)) types.push(fallback);
		}
		const options: Record<string, string> = {};
		for (const type of types.sort()) {
			options[type] = type.replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
		}
		return options;
	}

	private addPanelViewSetting(containerEl: HTMLElement, side: DockSide) {
		const name = side === "left" ? "Left panel view" : "Right panel view";
		new Setting(containerEl)
			.setName(name)
			.setDesc(`Which view runs in the ${side} panel. Any installed view works, including other plugins'.`)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(this.panelViewOptions())
					.setValue(this.plugin.panelView(side))
					.onChange(async (value) => {
						if (side === "left") this.plugin.settings.leftPanelView = value;
						else this.plugin.settings.rightPanelView = value;
						await this.plugin.saveSettings();
						await this.plugin.applySidePanelSetting();
					})
			);
	}

	private throttlingDesc(): DocumentFragment {
		const frag = new DocumentFragment();
		frag.append(
			"Stop the main window being throttled while it is minimized, so plugin content (Tasks, Dataview) still renders in the popout."
		);
		frag.createEl("br");
		frag.createEl("span", {
			cls: "mod-warning",
			text: "Warning: this keeps the main window ticking in the background, so idle CPU and battery use go up slightly.",
		});
		return frag;
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
					.addOption("daily", "Today's daily note")
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
			.setDesc("Keep the popout above all other apps")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.alwaysOnTop)
					.onChange(async (value) => {
						this.plugin.settings.alwaysOnTop = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Hide tab bar")
			.setDesc("Hide the tab bar in the popout. A thin strip at the top stays draggable so the window can still be moved.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.hideTabBar)
					.onChange(async (value) => {
						this.plugin.settings.hideTabBar = value;
						await this.plugin.saveSettings();
						this.plugin.applyTabBarSetting();
						await this.plugin.applySidePanelSetting();
					})
			);

		new Setting(containerEl)
			.setName("Show side panels")
			.setDesc("Add file explorer (left) and backlinks (right) panels to the popout, with toggle buttons in its top corners.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showSidePanel)
					.onChange(async (value) => {
						this.plugin.settings.showSidePanel = value;
						await this.plugin.saveSettings();
						await this.plugin.applySidePanelSetting();
						this.display();
					})
			);

		if (this.plugin.settings.showSidePanel) {
			this.addPanelViewSetting(containerEl, "left");
			this.addPanelViewSetting(containerEl, "right");
		}

		new Setting(containerEl)
			.setName("Keep the main window awake")
			.setDesc(this.throttlingDesc())
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.disableBackgroundThrottling)
					.onChange(async (value) => {
						this.plugin.settings.disableBackgroundThrottling = value;
						await this.plugin.saveSettings();
						this.plugin.applyBackgroundThrottling();
					})
			);

		new Setting(containerEl)
			.setName("Window opacity")
			.setDesc("Transparency of the floating window (0.2–1.0)")
			.addSlider((slider) =>
				slider
					.setLimits(0.2, 1, 0.05)
					.setValue(this.plugin.settings.opacity)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.opacity = value;
						await this.plugin.saveSettings();
						this.plugin.applyOpacity();
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
