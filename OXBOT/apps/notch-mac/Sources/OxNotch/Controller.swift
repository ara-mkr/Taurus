// SPDX-License-Identifier: GPL-3.0-or-later
// OXBOT's notch: displays, windows and hover. The panel setup is Vorssaint's NotchPanel (NotchWindowHost.swift), the
// camera width comes from the display's auxiliary top areas and the display choice follows NotchSupport.screenIndex
// and NotchService.updateScreen (Copyright (C) 2026 Vorssaint), with the Electron notch's settings. See NOTICE.

import AppKit
import SwiftUI

// MARK: - Displays

struct NotchDisplay {
    let id: CGDirectDisplayID
    let frame: CGRect
    let builtIn: Bool
    let notched: Bool
    /// The camera housing's width, between the menu bar's two halves; zero without one.
    let cameraWidth: CGFloat
    /// The housing's height on a notched display, the menu bar's elsewhere.
    let topHeight: CGFloat
    let isMain: Bool
}

enum Screens {
    static func id(_ s: NSScreen) -> CGDirectDisplayID {
        (s.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value ?? 0
    }

    static func all(simulateNotch: Bool) -> [(NSScreen, NotchDisplay)] {
        NSScreen.screens.enumerated().map { index, s in
            let id = id(s)
            var notched = s.safeAreaInsets.top > 0
            var camera: CGFloat = 0
            if let left = s.auxiliaryTopLeftArea, let right = s.auxiliaryTopRightArea { camera = max(0, right.minX - left.maxX) }
            var top = notched ? s.safeAreaInsets.top : s.frame.maxY - s.visibleFrame.maxY
            // A display with no menu bar of its own (Spaces span displays) still gets a capsule of menu-bar height.
            if !notched, top < 20 { top = 24 }
            if simulateNotch, index == 0, !notched { notched = true; top = 32 }
            if notched, camera < 1 { camera = 185 }
            return (s, NotchDisplay(id: id, frame: s.frame, builtIn: CGDisplayIsBuiltin(id) != 0, notched: notched,
                                    cameraWidth: camera, topHeight: top, isMain: index == 0))
        }
    }

    /// Which displays get an island. Vorssaint's choices (automatic, built-in, main) plus OXBOT's "all", where every
    /// display gets one of its own. A closed lid or a missing built-in screen falls back to the main display, so
    /// Ox is still there on an external monitor.
    static func chosen(_ all: [NotchDisplay], _ s: NotchSettings) -> [NotchDisplay] {
        guard s.on, let main = all.first(where: \.isMain) ?? all.first else { return [] }
        let pick: [NotchDisplay]
        switch s.display {
        case .all: pick = all
        case .main: pick = [main]
        case .builtin: pick = [all.first(where: \.builtIn) ?? main]
        case .automatic: pick = [all.first { $0.builtIn && $0.notched } ?? all.first(where: \.notched) ?? main]
        }
        return pick.filter { $0.notched || s.pillWithoutNotch }
    }
}

// MARK: - Panel

/// Vorssaint's NotchPanel: a borderless, non-activating panel just above the status items, on every Space, out of
/// the window cycle. It takes the keyboard only while the Ask box is open, without bringing any app forward.
final class NotchPanel: NSPanel {
    static let level = NSWindow.Level(rawValue: NSWindow.Level.statusBar.rawValue + 1)
    var acceptsKey = false
    override var canBecomeKey: Bool { acceptsKey }
    override var canBecomeMain: Bool { false }
    // Tiling window managers otherwise track a non-activating panel as a dialog.
    override func accessibilitySubrole() -> NSAccessibility.Subrole? { .unknown }
}

final class IslandWindow {
    let panel: NotchPanel
    let state: IslandState
    private let hub: Hub
    private var hoverWork: DispatchWorkItem?
    private var closeWork: DispatchWorkItem?

    init(display: NotchDisplay, hub: Hub, actions: (IslandWindow) -> Actions) {
        self.hub = hub
        state = IslandState(display: display)
        let g = state.geometry(hub.settings)
        panel = NotchPanel(contentRect: CGRect(origin: .zero, size: g.panel), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.appearance = NSAppearance(named: .darkAqua)
        panel.hasShadow = false
        panel.hidesOnDeactivate = false
        panel.isReleasedWhenClosed = false
        panel.animationBehavior = .none
        panel.level = NotchPanel.level
        panel.ignoresMouseEvents = true
        panel.title = "Ox"
        let host = NSHostingView(rootView: IslandView(hub: hub, state: state, actions: actions(self)))
        host.sizingOptions = []
        panel.contentView = host
        place(display)
        apply(hub.settings)
        panel.orderFrontRegardless()
    }

    /// Flush with the top of the display, centred on the camera.
    func place(_ display: NotchDisplay) {
        state.display = display
        let g = state.geometry(hub.settings)
        let frame = CGRect(x: (display.frame.midX - g.panel.width / 2).rounded(), y: display.frame.maxY - g.panel.height,
                           width: g.panel.width, height: g.panel.height)
        if panel.frame != frame { panel.setFrame(frame, display: true) }
    }

    func apply(_ s: NotchSettings) {
        // Stationary keeps it in place when Mission Control or Show Desktop moves windows aside.
        var behavior: NSWindow.CollectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]
        if s.overFullScreen { behavior.insert(.fullScreenAuxiliary) }
        panel.collectionBehavior = behavior
        // "In screenshots and sharing" off keeps it out of captures and screen sharing.
        panel.sharingType = s.inCaptures ? .readOnly : .none
    }

    func close() {
        hoverWork?.cancel(); closeWork?.cancel()
        panel.orderOut(nil)
        panel.close()
    }

    // MARK: Open and close

    func open(_ page: Page?) {
        hoverWork?.cancel(); hoverWork = nil
        if let page { state.page = page }
        guard !state.open else { focusIfAsking(); return }
        state.open = true
        panel.ignoresMouseEvents = false
        withAnimation(.spring(duration: 0.38, bounce: 0.12).delay(0.05)) { state.buttons = 1 }
        focusIfAsking()
    }

    func shut() {
        closeWork?.cancel(); closeWork = nil
        guard state.open else { return }
        withAnimation(.easeIn(duration: 0.16)) { state.buttons = 0 }
        state.open = false
        state.pinned = false
        if state.page != .music && state.page != .agents { state.page = .ox }
        panel.acceptsKey = false
        if panel.isKeyWindow { panel.resignKey() }
    }

    func show(_ page: Page) {
        state.page = page
        focusIfAsking()
    }

    private func focusIfAsking() {
        panel.acceptsKey = state.open && state.page == .ask
        if panel.acceptsKey { panel.makeKey() } else if panel.isKeyWindow { panel.resignKey() }
    }

    /// A panel rectangle (top-left origin) in screen coordinates.
    private func screen(_ r: CGRect) -> CGRect {
        CGRect(x: panel.frame.minX + r.minX, y: panel.frame.maxY - r.maxY, width: r.width, height: r.height)
    }

    /// Called about 30 times a second with the pointer. Clicks fall through the panel everywhere but the island
    /// (and, while it's open, its side buttons), and hover opens and closes it after the set delays.
    func tick(_ mouse: CGPoint) {
        let g = state.geometry(hub.settings)
        let s = hub.settings
        if state.open {
            let body = g.body(CGSize(width: g.openWidth, height: g.openHeight(state.page, hub)))
            let reach = screen(body.insetBy(dx: -(Metrics.gutter - 4), dy: 0).insetBy(dx: -6, dy: -8))
            let inside = reach.contains(mouse)
            panel.ignoresMouseEvents = !inside
            let typing = state.page == .ask && panel.isKeyWindow
            if inside || state.pinned || typing || state.askBusy { closeWork?.cancel(); closeWork = nil }
            else if closeWork == nil {
                let work = DispatchWorkItem { [weak self] in self?.shut() }
                closeWork = work
                DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(s.closeDelay), execute: work)
            }
        } else {
            var body = g.body(g.closedSize(hub))
            // Something to aim at even while the island hides in the notch or shows nothing.
            if body.width < 120 { body = body.insetBy(dx: -(120 - body.width) / 2, dy: 0) }
            body.size.height = max(body.height, g.top)
            let hot = screen(CGRect(x: body.minX - 6, y: 0, width: body.width + 12, height: g.gap + body.height + 4))
            let inside = hot.contains(mouse)
            panel.ignoresMouseEvents = !inside
            if inside, s.openOnHover {
                if hoverWork == nil {
                    let work = DispatchWorkItem { [weak self] in self?.open(nil) }
                    hoverWork = work
                    DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(s.hoverDelay), execute: work)
                }
            } else { hoverWork?.cancel(); hoverWork = nil }
        }
    }
}

// MARK: - Controller

final class NotchController: NSObject, NSApplicationDelegate {
    private let options: Options
    private let hub: Hub
    private let link: ServerLink
    private let nowPlaying: NowPlaying
    private let agents: AgentScanner
    private var windows: [CGDirectDisplayID: IslandWindow] = [:]
    private var mouseTimer: Timer?
    private var rebuildWork: DispatchWorkItem?
    private var observers: [NSObjectProtocol] = []

    init(options: Options) {
        self.options = options
        let raw = options.settings ?? (options.managed ? nil : DesktopFile.load(options.home))
        hub = Hub(settings: NotchSettings(json: raw))
        link = ServerLink(base: options.server, hub: hub)
        nowPlaying = NowPlaying(hub: hub)
        agents = AgentScanner(hub: hub)
        super.init()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        link.start()
        nowPlaying.start()
        agents.start()
        rebuild()
        // Displays come and go (a monitor plugged in, the lid closed): rebuild after they settle, as Vorssaint does.
        observers.append(NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main) { [weak self] _ in
            self?.scheduleRebuild()
        })
        observers.append(NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.activeSpaceDidChangeNotification, object: nil, queue: .main) { [weak self] _ in
            self?.windows.values.forEach { $0.panel.orderFrontRegardless() }
        })
        let timer = Timer(timeInterval: 1.0 / 30, repeats: true) { [weak self] _ in
            let mouse = NSEvent.mouseLocation
            self?.windows.values.forEach { $0.tick(mouse) }
        }
        RunLoop.main.add(timer, forMode: .common)
        mouseTimer = timer
        if options.managed { listenToDesktopApp() }
        if let page = options.openPage {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
                self?.windows.values.forEach { $0.open(page); $0.state.pinned = true }
            }
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        nowPlaying.stop(); link.stop(); agents.stop()
    }

    private func scheduleRebuild() {
        rebuildWork?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.rebuild() }
        rebuildWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1, execute: work)
    }

    /// One island per chosen display, each placed on its display; gone displays lose theirs.
    private func rebuild() {
        let chosen = Screens.chosen(Screens.all(simulateNotch: options.simulateNotch).map(\.1), hub.settings)
        let ids = Set(chosen.map(\.id))
        for (id, w) in windows where !ids.contains(id) { w.close(); windows[id] = nil }
        for d in chosen {
            if let w = windows[d.id] { w.place(d); w.apply(hub.settings) }
            else { windows[d.id] = IslandWindow(display: d, hub: hub) { [weak self] w in self?.actions(for: w) ?? Self.none } }
        }
    }

    private static let none = Actions(open: { _ in }, close: {}, page: { _ in }, pin: {}, dashboard: {}, save: { _ in },
                                      music: { _ in }, ask: {}, cancelTimer: { _ in }, answerRing: { _ in })

    private func actions(for w: IslandWindow) -> Actions {
        Actions(
            open: { [weak w] page in w?.open(page) },
            close: { [weak w] in w?.shut() },
            page: { [weak w] page in w?.show(page) },
            pin: { [weak w] in w?.state.pinned.toggle() },
            dashboard: { [weak self] in self?.openDashboard() },
            save: { [weak self] s in self?.save(s) },
            music: { [weak self] command in self?.music(command) },
            ask: { [weak self, weak w] in if let w { self?.ask(w) } },
            cancelTimer: { [weak self] id in self?.link.cancelTimer(id) },
            answerRing: { [weak self] id in self?.link.answerRing(id) })
    }

    private func music(_ command: String) {
        guard let t = hub.track else { return }
        if t.fromSystem { nowPlaying.send(command); return }
        // OXBOT's own Spotify player takes the same words the Electron notch's buttons say.
        let word = command == "toggle" ? (t.playing ? "pause" : "resume") : command
        link.music(word)
    }

    private func ask(_ w: IslandWindow) {
        let s = w.state
        guard !s.askBusy, !s.askText.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        s.askBusy = true; s.askError = nil; s.askAnswer = nil
        let text = s.askText
        Task { [weak self] in
            guard let self else { return }
            let result = await self.link.ask(text)
            await MainActor.run {
                s.askBusy = false
                switch result {
                case .success(let answer): s.askAnswer = answer; s.askText = ""
                case .failure(let e): s.askError = e.message
                }
            }
        }
    }

    /// Applied at once; written once a slider has stopped moving.
    private var saveWork: DispatchWorkItem?
    private func save(_ s: NotchSettings) {
        guard s != hub.settings else { return }
        hub.settings = s
        rebuild()
        saveWork?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            let s = self.hub.settings
            if self.options.managed { self.tellDesktopApp(["do": "save", "settings": s.editable]) }
            else { DesktopFile.save(s.editable, home: self.options.home) }
        }
        saveWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4, execute: work)
    }

    private func openDashboard() {
        if options.managed { tellDesktopApp(["do": "dashboard"]); return }
        var c = URLComponents(url: options.server, resolvingAgainstBaseURL: false)
        // OXBOT's page lives at localhost, where its sign-in redirects point.
        c?.host = "localhost"; c?.path = "/"
        if let url = c?.url { NSWorkspace.shared.open(url) }
    }

    // MARK: The desktop app's pipe

    private func tellDesktopApp(_ message: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: message) else { return }
        FileHandle.standardOutput.write(data + Data("\n".utf8))
    }

    /// Settings and commands from OXBOT's desktop app, one JSON line each. When it goes away, so does the notch.
    private func listenToDesktopApp() {
        var buffer = Data()
        FileHandle.standardInput.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            if data.isEmpty { DispatchQueue.main.async { NSApp.terminate(nil) }; handle.readabilityHandler = nil; return }
            buffer.append(data)
            while let end = buffer.firstIndex(of: 0x0A) {
                let line = buffer[buffer.startIndex..<end]
                buffer.removeSubrange(buffer.startIndex...end)
                guard let json = try? JSONSerialization.jsonObject(with: line) as? [String: Any] else { continue }
                DispatchQueue.main.async { self?.command(json) }
            }
        }
    }

    private func command(_ json: [String: Any]) {
        if let s = json["settings"] as? [String: Any] {
            let next = NotchSettings(json: s, base: hub.settings)
            if next != hub.settings { hub.settings = next; rebuild() }
        }
        if let page = (json["open"] as? String).flatMap(Page.init(rawValue:)) {
            let first = windows.values.first { $0.state.display.isMain } ?? windows.values.first
            first?.open(page)
            first?.state.pinned = true
        }
    }
}
