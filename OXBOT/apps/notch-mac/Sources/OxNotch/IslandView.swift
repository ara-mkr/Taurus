// SPDX-License-Identifier: GPL-3.0-or-later
// OXBOT's notch, drawn. Layout, sizes, settings and motion are ported from Vorssaint's notch (NotchView.swift,
// NotchWindowHost.swift's silhouette, NotchQuickAccessView.swift, NotchAgentStrip.swift, NotchSettings.swift and
// NotchSupport.swift's NotchSize, NotchCameraFit, NotchCapsuleFit and NotchQuickAccessLayout; Copyright (C) 2026
// Vorssaint), reskinned for OXBOT: Ox instead of Vorssaint's mascot, one ink, red only for what needs you now,
// nothing under 13 points. See NOTICE.

import SwiftUI
import AppKit

enum Ink {
    static let primary = Color(red: 244 / 255, green: 243 / 255, blue: 238 / 255)
    static let secondary = Color(red: 169 / 255, green: 168 / 255, blue: 161 / 255)
    static let tertiary = Color(red: 138 / 255, green: 137 / 255, blue: 131 / 255)
    static let signal = Color(red: 1, green: 90 / 255, blue: 79 / 255)
    static let line = Color.white.opacity(0.1)
}

/// What the island's buttons do; the controller fills these in for each island.
struct Actions {
    var open: (Page?) -> Void
    var close: () -> Void
    var page: (Page) -> Void
    var pin: () -> Void
    var dashboard: () -> Void
    var save: (NotchSettings) -> Void
    var music: (String) -> Void
    var ask: () -> Void
    var cancelTimer: (String) -> Void
    var answerRing: (String) -> Void
}

// MARK: - Geometry

enum Metrics {
    /// Room beside the open island for its side buttons.
    static let gutter: CGFloat = 128
    static let buttonHeight: CGFloat = 34
    static let buttonRows: CGFloat = 44
    static let buttonGap: CGFloat = 12
    static let agentRow: CGFloat = 76
    static func text(_ s: String, size: CGFloat = 13) -> CGFloat {
        let font = NSFont.monospacedDigitSystemFont(ofSize: size, weight: .semibold)
        return ceil((s as NSString).size(withAttributes: [.font: font]).width)
    }
}

/// Where an island sits on one display. On a display with a camera housing (or, by setting, any display) it hangs
/// from the top edge, as tall as the housing or menu bar; elsewhere it floats in the menu bar as a capsule.
/// Vorssaint's sizes: Compact and Spacious, or Custom up to 600 by 640 points.
struct Geometry {
    let notched: Bool
    let top: CGFloat
    let gap: CGFloat
    let camera: CGFloat
    let openWidth: CGFloat
    let maxHeight: CGFloat
    let capsuleWidth: CGFloat
    let panel: CGSize

    init(display: NotchDisplay, settings: NotchSettings) {
        let n = settings.native
        notched = display.notched || n.shape == .notch
        if display.notched {
            top = max(16, display.topHeight + CGFloat(n.cameraHeight))
            camera = max(0, display.cameraWidth + CGFloat(n.cameraWidth))
            gap = 0; capsuleWidth = 0
        } else if notched {
            top = display.topHeight; camera = 0; gap = 0; capsuleWidth = 0
        } else {
            let bar = display.topHeight
            top = max(18, min(32, bar - 4 + CGFloat(n.capsuleHeight)))
            gap = max(1, (bar - top) / 2) + CGFloat(n.capsuleDrop) + CGFloat(settings.dropFromTop)
            camera = 0
            capsuleWidth = CGFloat(n.capsuleWidth)
        }
        switch n.size {
        case .compact: openWidth = 480; maxHeight = 320
        case .spacious: openWidth = 560; maxHeight = 400
        case .custom: openWidth = CGFloat(n.customWidth); maxHeight = CGFloat(n.customHeight)
        }
        panel = CGSize(width: openWidth + 2 * Metrics.gutter + 24, height: maxHeight + 64)
    }

    var header: CGFloat { notched ? max(top, 30) : 34 }
    var mascot: CGFloat { notched ? max(12, (min(top, 38) * 0.42).rounded()) : 13 }
    var maxContent: CGFloat { maxHeight - header - 16 }

    func content(_ page: Page, _ hub: Hub) -> CGFloat {
        let natural: CGFloat
        switch page {
        case .ox: natural = 176
        case .music: natural = 128
        case .agents: natural = 8 + CGFloat(max(1, hub.trackedAgents.count)) * Metrics.agentRow + (hub.plans.isEmpty ? 0 : 36)
        case .ask: natural = 156
        case .settings: natural = .greatestFiniteMagnitude
        }
        return min(natural, maxContent)
    }
    func openHeight(_ page: Page, _ hub: Hub) -> CGFloat { header + content(page, hub) + 16 }

    func closedSize(_ hub: Hub) -> CGSize {
        let reading = Reading.of(hub)
        let ox = hub.settings.idleOx || reading != .none
        let oxWidth = OxMark.width(for: mascot)
        if notched {
            // The island stays centred on the camera, so both wings are as wide as the wider one.
            let wing = max(ox ? oxWidth + 20 : 0, reading == .none ? 0 : reading.width(hub) + 20)
            return CGSize(width: camera + 2 * wing, height: top)
        }
        guard ox || reading != .none else { return .zero }
        let width = 24 + (ox ? oxWidth : 0) + (reading == .none ? 0 : (ox ? 8 : 0) + reading.width(hub)) + capsuleWidth
        return CGSize(width: max(top, width), height: top)
    }

    func size(_ hub: Hub, _ state: IslandState) -> CGSize {
        state.open ? CGSize(width: openWidth, height: openHeight(state.page, hub)) : closedSize(hub)
    }

    /// The island's rectangle in the panel, top-left origin.
    func body(_ size: CGSize) -> CGRect { CGRect(x: (panel.width - size.width) / 2, y: gap, width: size.width, height: size.height) }
}

/// The one reading the closed island shows beside the camera, most urgent first.
enum Reading: Equatable {
    case none, ring, notice(Hub.Notice), listening, thinking, agent(Provider, Date), music, timer(Date)

    static func of(_ hub: Hub) -> Reading {
        if hub.ring != nil { return .ring }
        if let n = hub.notice { return .notice(n) }
        if let v = hub.voice {
            if v.phase == .listening { return .listening }
            if v.phase == .thinking, Date().timeIntervalSince(v.at) < 180 { return .thinking }
        }
        if hub.settings.native.live, let w = hub.workingAgents.first { return .agent(w.provider, w.work.since) }
        if let t = hub.track, t.playing { return .music }
        if hub.settings.showTimers, let t = hub.timers.first(where: { $0.endsAt > Date() }) { return .timer(t.endsAt) }
        return .none
    }

    func width(_ hub: Hub) -> CGFloat {
        switch self {
        case .none: return 0
        case .ring: return Metrics.text("Needs you")
        case .notice(let n): return AgentMark.width(n.provider, size: 13) + 6 + min(180, Metrics.text(n.text))
        case .listening: return Metrics.text("Listening")
        case .thinking: return Metrics.text("Thinking")
        case .agent(let p, let since): return AgentMark.width(p, size: 13) + 6 + Metrics.text(AgentReadout.widest(p, since: since, hub: hub))
        case .music: return 42
        case .timer(let end): return Metrics.text(end.timeIntervalSinceNow > 3000 ? "0:00:00" : "00:00")
        }
    }
}

/// What the closed island says beside a working agent's mark (Vorssaint's NotchAgentReadout): how long the turn
/// has run, today's tokens, or what's left of its plan window.
enum AgentReadout {
    static func text(_ p: Provider, since: Date, at date: Date, hub: Hub) -> String {
        let n = hub.settings.native
        let usage = hub.agents.first { $0.provider == p }
        switch n.readout {
        case .tokens:
            if p == .copilot, let r = usage?.requestsToday { return "\(r) req" }
            return tokens(usage?.tokensToday ?? 0)
        case .limit:
            if let w = usage.flatMap({ window($0, n.limitFocus) }) { return limit(w, n.limitDisplay) }
            return clock(date.timeIntervalSince(since))
        case .elapsed:
            return clock(date.timeIntervalSince(since))
        }
    }
    static func widest(_ p: Provider, since: Date, hub: Hub) -> String {
        hub.settings.native.readout == .elapsed && Date().timeIntervalSince(since) < 3000 ? "00:00" : text(p, since: since, at: Date(), hub: hub) + "0"
    }
    static func window(_ a: AgentUsage, _ focus: NotchSettings.Native.LimitFocus) -> LimitWindow? {
        switch focus {
        case .mostUsed: return a.limits.max { $0.usedPercent < $1.usedPercent }
        case .session: return a.limits.first { ($0.minutes ?? .max) <= 720 }
        case .weekly: return a.limits.first { (6 * 1440...8 * 1440).contains($0.minutes ?? 0) }
        }
    }
    static func limit(_ w: LimitWindow, _ display: NotchSettings.Native.LimitDisplay) -> String {
        display == .remaining ? "\(Int((100 - w.usedPercent).rounded()))% left" : "\(Int(w.usedPercent.rounded()))% used"
    }
    static func tokens(_ n: Int) -> String {
        n >= 1_000_000 ? String(format: "%.1fM", Double(n) / 1_000_000) : n >= 1_000 ? "\(n / 1_000)K" : "\(n)"
    }
}

func clock(_ seconds: TimeInterval) -> String {
    let t = max(0, Int(seconds)), h = t / 3600, m = (t % 3600) / 60, s = t % 60
    return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%d:%02d", m, s)
}

/// Per display: whether its island is open, on which page, and the Ask box.
final class IslandState: ObservableObject {
    @Published var display: NotchDisplay
    @Published var open = false
    @Published var page: Page = .ox
    @Published var pinned = false
    /// The side buttons' way out, 0 tucked under the island to 1 beside it.
    @Published var buttons: CGFloat = 0
    @Published var askText = ""
    @Published var askBusy = false
    @Published var askAnswer: String?
    @Published var askError: String?
    init(display: NotchDisplay) { self.display = display }
    func geometry(_ s: NotchSettings) -> Geometry { Geometry(display: display, settings: s) }
}

// MARK: - The island

/// Vorssaint's silhouette: hanging from the top edge, the top corners flare out into the menu bar and the bottom
/// corners are round; floating, a capsule or a rounded panel.
struct IslandShape: Shape {
    var notched: Bool
    var flare: CGFloat
    var radius: CGFloat
    var animatableData: AnimatablePair<CGFloat, CGFloat> {
        get { AnimatablePair(flare, radius) }
        set { flare = newValue.first; radius = newValue.second }
    }
    func path(in r: CGRect) -> Path {
        guard notched else { return Path(roundedRect: r, cornerRadius: max(0, min(radius, r.height / 2, r.width / 2)), style: .continuous) }
        let f = min(flare, r.width / 2), b = max(0, min(radius, r.height - f, (r.width - 2 * f) / 2))
        var p = Path()
        p.move(to: CGPoint(x: r.minX, y: r.minY))
        p.addQuadCurve(to: CGPoint(x: r.minX + f, y: r.minY + f), control: CGPoint(x: r.minX + f, y: r.minY))
        p.addLine(to: CGPoint(x: r.minX + f, y: r.maxY - b))
        p.addQuadCurve(to: CGPoint(x: r.minX + f + b, y: r.maxY), control: CGPoint(x: r.minX + f, y: r.maxY))
        p.addLine(to: CGPoint(x: r.maxX - f - b, y: r.maxY))
        p.addQuadCurve(to: CGPoint(x: r.maxX - f, y: r.maxY - b), control: CGPoint(x: r.maxX - f, y: r.maxY))
        p.addLine(to: CGPoint(x: r.maxX - f, y: r.minY + f))
        p.addQuadCurve(to: CGPoint(x: r.maxX, y: r.minY), control: CGPoint(x: r.maxX - f, y: r.minY))
        p.closeSubpath()
        return p
    }
}

/// Dark glass, for the translucent background and the side buttons.
struct Glass: NSViewRepresentable {
    func makeNSView(context: Context) -> NSVisualEffectView {
        let v = NSVisualEffectView()
        v.material = .hudWindow
        v.blendingMode = .behindWindow
        v.state = .active
        v.appearance = NSAppearance(named: .darkAqua)
        return v
    }
    func updateNSView(_ nsView: NSVisualEffectView, context: Context) {}
}

struct IslandView: View {
    @ObservedObject var hub: Hub
    @ObservedObject var state: IslandState
    let actions: Actions

    var body: some View {
        let g = state.geometry(hub.settings)
        let n = hub.settings.native
        let size = g.size(hub, state)
        let flare: CGFloat = g.notched ? (state.open ? 14 : 6) : 0
        let radius: CGFloat = g.notched ? (state.open ? 26 : 10) : (state.open ? 24 : size.height / 2)
        let shape = IslandShape(notched: g.notched, flare: flare, radius: radius)
        // A closed island around a camera stays solid black so it reads as part of the housing.
        let glass = n.glass && (state.open || !state.display.notched)
        ZStack(alignment: .topLeading) {
            SideButtons(hub: hub, state: state, actions: actions, geometry: g)
            ZStack(alignment: .top) {
                Group {
                    if glass { ZStack { Glass(); Color.black.opacity(0.55) } } else { Color.black }
                }
                .clipShape(shape)
                .overlay { if n.outline { shape.stroke(Color.white.opacity(0.22), lineWidth: 1) } }
                Group {
                    if state.open { OpenContent(hub: hub, state: state, actions: actions, geometry: g).transition(.opacity.animation(.easeOut(duration: 0.18).delay(0.08))) }
                    else { ClosedContent(hub: hub, geometry: g, size: size).transition(.opacity.animation(.easeOut(duration: 0.12))) }
                }
                .frame(width: size.width, height: size.height, alignment: .top)
                .clipShape(IslandShape(notched: g.notched, flare: 0, radius: radius))
            }
            .frame(width: size.width + 2 * flare, height: size.height)
            .contentShape(shape)
            .onTapGesture { if !state.open { actions.open(nil) } }
            .opacity(size.width < 1 ? 0 : 1)
            .position(x: g.panel.width / 2, y: g.gap + size.height / 2)
        }
        .frame(width: g.panel.width, height: g.panel.height, alignment: .topLeading)
        .animation(state.open ? .spring(duration: 0.42, bounce: 0.18) : .spring(duration: 0.3, bounce: 0), value: state.open)
        .animation(.spring(duration: 0.34, bounce: 0.12), value: state.page)
        .animation(.spring(duration: 0.3, bounce: 0.1), value: size)
        .foregroundStyle(Ink.primary)
        .environment(\.colorScheme, .dark)
        .onExitCommand { actions.close() }
    }
}

// MARK: - Closed

struct ClosedContent: View {
    @ObservedObject var hub: Hub
    let geometry: Geometry
    let size: CGSize

    var body: some View {
        let reading = Reading.of(hub)
        let ox = hub.settings.idleOx || reading != .none
        let mood: OxMark.Mood = reading == .listening ? .listening : reading == .thinking ? .thinking : .rest
        let mark = OxMark(height: geometry.mascot, mood: mood, charges: hub.charges)
        if geometry.notched {
            let wing = max(0, (size.width - geometry.camera) / 2)
            HStack(spacing: 0) {
                Group { if hub.settings.mascotLeft { if ox { mark } } else { ReadingView(hub: hub, reading: reading) } }
                    .padding(.leading, 10).frame(width: wing, alignment: .leading)
                Color.clear.frame(width: geometry.camera)
                Group { if hub.settings.mascotLeft { ReadingView(hub: hub, reading: reading) } else if ox { mark } }
                    .padding(.trailing, 10).frame(width: wing, alignment: .trailing)
            }
            .frame(height: geometry.top)
        } else {
            HStack(spacing: 8) {
                if hub.settings.mascotLeft { if ox { mark }; ReadingView(hub: hub, reading: reading) }
                else { ReadingView(hub: hub, reading: reading); if ox { mark } }
            }
            .padding(.horizontal, 12)
            .frame(height: geometry.top)
        }
    }
}

struct ReadingView: View {
    @ObservedObject var hub: Hub
    let reading: Reading
    var body: some View {
        Group {
            switch reading {
            case .none: EmptyView()
            case .ring: Text("Needs you").foregroundStyle(Ink.signal)
            case .notice(let n):
                HStack(spacing: 6) { AgentMark(provider: n.provider, size: 13); Text(n.text).lineLimit(1).frame(maxWidth: 180, alignment: .leading) }
            case .listening: Text("Listening")
            case .thinking: Text("Thinking").foregroundStyle(Ink.secondary)
            case .agent(let p, let since):
                HStack(spacing: 6) {
                    AgentMark(provider: p, size: 13)
                    TimelineView(.periodic(from: .now, by: 1)) { c in Text(AgentReadout.text(p, since: since, at: c.date, hub: hub)) }
                }
            case .music:
                HStack(spacing: 6) { Artwork(image: hub.track?.artwork, size: 20, radius: 5); Bars(playing: hub.track?.playing == true).frame(width: 14, height: 12) }
            case .timer(let end):
                TimelineView(.periodic(from: .now, by: 1)) { c in Text(clock(end.timeIntervalSince(c.date))) }
            }
        }
        .font(.system(size: 13, weight: .semibold))
        .monospacedDigit()
        .lineLimit(1)
        .fixedSize()
    }
}

struct Artwork: View {
    let image: NSImage?
    let size: CGFloat
    var radius: CGFloat = 10
    var body: some View {
        Group {
            if let image { Image(nsImage: image).resizable().aspectRatio(contentMode: .fill) }
            else { Color.white.opacity(0.08) }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
    }
}

/// Three ink bars that move while music plays and rest while it's paused.
struct Bars: View {
    let playing: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 20, paused: !playing || reduceMotion)) { c in
            let t = c.date.timeIntervalSinceReferenceDate
            GeometryReader { g in
                HStack(alignment: .bottom, spacing: 2) {
                    ForEach(0..<3, id: \.self) { i in
                        let wave = playing && !reduceMotion ? 0.35 + 0.65 * abs(sin(t * (3.1 + Double(i) * 1.3) + Double(i))) : 0.3
                        RoundedRectangle(cornerRadius: 1).fill(Ink.primary).frame(width: (g.size.width - 4) / 3, height: g.size.height * wave)
                    }
                }
                .frame(width: g.size.width, height: g.size.height, alignment: .bottom)
            }
        }
        .accessibilityHidden(true)
    }
}

// MARK: - Open

struct OpenContent: View {
    @ObservedObject var hub: Hub
    @ObservedObject var state: IslandState
    let actions: Actions
    let geometry: Geometry

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header.frame(height: geometry.header)
            Group {
                switch state.page {
                case .ox: OxPage(hub: hub, actions: actions)
                case .music: MusicPage(hub: hub, actions: actions)
                case .agents: AgentsPage(hub: hub)
                case .ask: AskPage(state: state, actions: actions)
                case .settings: SettingsPage(hub: hub, actions: actions)
                }
            }
            .padding(.horizontal, 22)
            .padding(.top, 8)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .padding(.bottom, 16)
    }

    private var status: String {
        if !hub.connected { return "Offline" }
        if let v = hub.recentVoice, v.phase == .listening { return "Listening" }
        if let v = hub.recentVoice, v.phase == .thinking { return "Thinking" }
        if !hub.running.isEmpty || !hub.workingAgents.isEmpty { return "Working" }
        return "Idle"
    }

    private var header: some View {
        let mood: OxMark.Mood = hub.voice?.phase == .listening ? .listening : hub.voice?.phase == .thinking ? .thinking : .rest
        return HStack(spacing: 0) {
            HStack(spacing: 8) {
                OxMark(height: geometry.mascot, mood: mood, charges: hub.charges)
                Text(status).font(.system(size: 13, weight: .semibold)).foregroundStyle(Ink.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.leading, 22)
            if geometry.notched { Color.clear.frame(width: geometry.camera) }
            HStack(spacing: 6) {
                if hub.ring != nil { Text("Needs you").foregroundStyle(Ink.signal) }
                else { ForEach(hub.workingAgents.map(\.provider).uniqued(), id: \.self) { AgentMark(provider: $0, size: 13) } }
            }
            .font(.system(size: 13, weight: .semibold))
            .frame(maxWidth: .infinity, alignment: .trailing)
            .padding(.trailing, 22)
        }
    }
}

private extension Array where Element: Hashable {
    func uniqued() -> [Element] { var seen = Set<Element>(); return filter { seen.insert($0).inserted } }
}

struct WordButton: View {
    let title: String
    var action: () -> Void
    @State private var hover = false
    init(_ title: String, action: @escaping () -> Void) { self.title = title; self.action = action }
    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Ink.primary)
                .padding(.horizontal, 10).padding(.vertical, 4)
                .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(Color.white.opacity(hover ? 0.18 : 0.1)))
        }
        .buttonStyle(.plain)
        .onHover { hover = $0 }
    }
}

struct Rule: View { var body: some View { Rectangle().fill(Ink.line).frame(height: 1) } }

struct OxPage: View {
    @ObservedObject var hub: Hub
    let actions: Actions

    private var headline: (text: String, tone: Color) {
        if !hub.connected { return ("OXBOT isn’t running. Open it and Ox will be here.", Ink.primary) }
        if let v = hub.recentVoice {
            switch v.phase {
            case .listening: return ("Listening.", Ink.primary)
            case .thinking: return ("Thinking.", Ink.primary)
            case .answer where hub.settings.showAnswer: return (v.text ?? "Done.", Ink.primary)
            case .error: return (v.text ?? "That didn’t work.", Ink.signal)
            default: break
            }
        }
        if let a = hub.running.last { return ("Working: \(a.text)", Ink.primary) }
        return ("Nothing running right now.", Ink.secondary)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let ring = hub.ring {
                HStack {
                    Text(ring.title).font(.system(size: 15, weight: .semibold)).foregroundStyle(Ink.signal).lineLimit(1)
                    Spacer()
                    WordButton("I’m on it") { actions.answerRing(ring.id) }
                }
            }
            Text(headline.text).font(.system(size: 15)).foregroundStyle(headline.tone).lineLimit(3).fixedSize(horizontal: false, vertical: true)
            if let said = hub.recentVoice?.said, !said.isEmpty {
                Text("You asked “\(said)”").font(.system(size: 13)).foregroundStyle(Ink.tertiary).lineLimit(1)
            }
            let lines = Array(hub.activity.suffix(3).reversed())
            if !lines.isEmpty || (hub.settings.showTimers && !hub.timers.isEmpty) { Rule().padding(.vertical, 2) }
            ForEach(lines) { a in
                HStack {
                    Text(a.text).lineLimit(1)
                    Spacer(minLength: 12)
                    Text(a.state == "running" ? "Running" : a.state == "failed" ? "Failed" : a.state == "done" ? "Done" : "")
                        .foregroundStyle(a.state == "failed" ? Ink.signal : Ink.tertiary)
                }
                .font(.system(size: 13)).foregroundStyle(Ink.secondary)
            }
            if hub.settings.showTimers {
                ForEach(hub.timers) { t in
                    HStack {
                        Text(t.label).font(.system(size: 13))
                        Spacer()
                        TimelineView(.periodic(from: .now, by: 1)) { c in Text(clock(t.endsAt.timeIntervalSince(c.date))).font(.system(size: 13, weight: .semibold)).monospacedDigit() }
                        WordButton("Cancel") { actions.cancelTimer(t.id) }
                    }
                }
            }
            Spacer(minLength: 0)
            HStack {
                Spacer()
                Button("Settings") { actions.page(.settings) }.buttonStyle(.plain).font(.system(size: 13, weight: .semibold)).foregroundStyle(Ink.secondary)
            }
        }
    }
}

struct MusicPage: View {
    @ObservedObject var hub: Hub
    let actions: Actions
    var body: some View {
        if let t = hub.track {
            HStack(alignment: .top, spacing: 16) {
                Artwork(image: t.artwork, size: 96, radius: 12)
                VStack(alignment: .leading, spacing: 3) {
                    Text(t.title).font(.system(size: 15, weight: .semibold)).lineLimit(1)
                    Text(t.artist).font(.system(size: 13)).foregroundStyle(Ink.secondary).lineLimit(1)
                    Text(t.app).font(.system(size: 13)).foregroundStyle(Ink.tertiary).lineLimit(1)
                    Progress(track: t).padding(.top, 6)
                    HStack(spacing: 8) {
                        WordButton("Previous") { actions.music("previous") }
                        WordButton(t.playing ? "Pause" : "Play") { actions.music("toggle") }
                        WordButton("Next") { actions.music("next") }
                    }
                    .padding(.top, 4)
                }
            }
        } else {
            Text(hub.settings.showMusic ? "Nothing is playing." : "Now playing is off in Settings.").font(.system(size: 15)).foregroundStyle(Ink.secondary)
        }
    }
}

struct Progress: View {
    let track: Track
    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { c in
            let at = track.position(at: c.date)
            HStack(spacing: 10) {
                Text(at.map(clock) ?? "").frame(width: 44, alignment: .leading)
                GeometryReader { g in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Color.white.opacity(0.14))
                        if let at, let d = track.duration, d > 0 { Capsule().fill(Ink.primary).frame(width: g.size.width * min(1, at / d)) }
                    }
                }
                .frame(height: 4)
                Text(track.duration.map(clock) ?? "").frame(width: 44, alignment: .trailing)
            }
            .font(.system(size: 13)).monospacedDigit().foregroundStyle(Ink.secondary)
        }
    }
}

struct AgentsPage: View {
    @ObservedObject var hub: Hub

    private func ago(_ d: Date) -> String {
        let m = Int(Date().timeIntervalSince(d) / 60)
        return m < 1 ? "just now" : m < 60 ? "\(m) min ago" : m < 2880 ? "\(m / 60) h ago" : "\(m / 1440) days ago"
    }
    private func resets(_ d: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = Calendar.current.isDateInToday(d) ? "HH:mm" : "EEE HH:mm"
        return f.string(from: d)
    }

    var body: some View {
        let agents = hub.trackedAgents
        let display = hub.settings.native.limitDisplay
        ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 10) {
                if agents.isEmpty { Text("No agents tracked. Turn them on in Settings.").font(.system(size: 15)).foregroundStyle(Ink.secondary) }
                ForEach(Array(agents.enumerated()), id: \.element.provider) { i, a in
                    if i > 0 { Rule() }
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 8) {
                            AgentMark(provider: a.provider, size: 15, nameIfMissing: false)
                            Text(a.provider.name).font(.system(size: 15, weight: .semibold))
                            Spacer()
                            TimelineView(.periodic(from: .now, by: 1)) { c in
                                if let w = a.working.first {
                                    Text("Working \(clock(c.date.timeIntervalSince(w.since))) in \(w.project)\(a.working.count > 1 ? " and \(a.working.count - 1) more" : "")")
                                        .foregroundStyle(Ink.primary)
                                } else {
                                    Text(a.lastActive.map { "Idle, last active \(ago($0))" } ?? "No sessions").foregroundStyle(Ink.secondary)
                                }
                            }
                            .font(.system(size: 13, weight: .semibold)).monospacedDigit().lineLimit(1)
                        }
                        Text(a.provider == .copilot ? "\(a.requestsToday) requests and \(AgentReadout.tokens(a.tokensToday)) tokens today"
                             : "\(AgentReadout.tokens(a.tokensToday)) tokens today\(a.plan.map { " · \($0) plan" } ?? "")")
                            .font(.system(size: 13)).foregroundStyle(Ink.secondary)
                        ForEach(Array(a.limits.enumerated()), id: \.offset) { _, w in
                            HStack(spacing: 10) {
                                Text(w.name).frame(width: 104, alignment: .leading)
                                GeometryReader { g in
                                    ZStack(alignment: .leading) {
                                        Capsule().fill(Color.white.opacity(0.14))
                                        let share = display == .remaining ? 100 - w.usedPercent : w.usedPercent
                                        Capsule().fill(Ink.primary).frame(width: g.size.width * share / 100)
                                    }
                                }
                                .frame(height: 4)
                                Text("\(AgentReadout.limit(w, display))\(w.resetsAt.map { ", resets \(resets($0))" } ?? "")")
                                    .frame(width: 176, alignment: .trailing)
                            }
                            .font(.system(size: 13)).monospacedDigit().foregroundStyle(Ink.secondary)
                        }
                    }
                }
                if !hub.plans.isEmpty {
                    Rule()
                    Text("Ox through your plans today: " + hub.plans.map { "\($0.name) \($0.callsToday) \($0.callsToday == 1 ? "call" : "calls")" }.joined(separator: ", "))
                        .font(.system(size: 13)).foregroundStyle(Ink.secondary).lineLimit(2)
                }
            }
        }
    }
}

struct AskPage: View {
    @ObservedObject var state: IslandState
    let actions: Actions
    @FocusState private var focused: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                TextField("Ask Ox", text: $state.askText)
                    .textFieldStyle(.plain).font(.system(size: 15)).focused($focused)
                    .onSubmit { actions.ask() }
                WordButton(state.askBusy ? "Asking" : "Ask") { actions.ask() }.disabled(state.askBusy)
            }
            .padding(.horizontal, 12).padding(.vertical, 8)
            .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color.white.opacity(0.08)))
            if state.askBusy { Text("Thinking.").font(.system(size: 15)).foregroundStyle(Ink.secondary) }
            if let e = state.askError { Text(e).font(.system(size: 15)).foregroundStyle(Ink.signal).lineLimit(2) }
            if let a = state.askAnswer {
                ScrollView { Text(a).font(.system(size: 15)).frame(maxWidth: .infinity, alignment: .leading).textSelection(.enabled) }
            }
        }
        .onAppear { DispatchQueue.main.async { focused = true } }
    }
}

/// Vorssaint's Settings > Notch and Settings > Agents, in the island, in its order. Every change applies at once.
struct SettingsPage: View {
    @ObservedObject var hub: Hub
    let actions: Actions
    typealias N = NotchSettings.Native

    private func change(_ edit: (inout NotchSettings) -> Void) {
        var s = hub.settings
        edit(&s)
        actions.save(s)
    }

    private func row<T: Equatable>(_ label: String, _ options: [(String, T)], _ value: T, _ set: @escaping (inout NotchSettings, T) -> Void) -> some View {
        HStack {
            Text(label).font(.system(size: 13)).foregroundStyle(Ink.secondary).lineLimit(1)
            Spacer(minLength: 12)
            HStack(spacing: 2) {
                ForEach(Array(options.enumerated()), id: \.offset) { _, o in
                    let on = o.1 == value
                    Button { change { set(&$0, o.1) } } label: {
                        Text(o.0).font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(on ? Ink.primary : Ink.secondary)
                            .padding(.horizontal, 9).padding(.vertical, 3)
                            .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Color.white.opacity(on ? 0.16 : 0)))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(2)
            .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color.white.opacity(0.06)))
        }
    }

    private func onOff(_ label: String, _ value: Bool, _ set: @escaping (inout NotchSettings, Bool) -> Void) -> some View {
        row(label, [("On", true), ("Off", false)], value, set)
    }

    private func slider(_ label: String, _ value: Double, _ range: ClosedRange<Double>, step: Double, unit: String = " pt",
                        _ set: @escaping (inout NotchSettings, Double) -> Void) -> some View {
        HStack(spacing: 10) {
            Text(label).font(.system(size: 13)).foregroundStyle(Ink.secondary).lineLimit(1)
            Spacer(minLength: 12)
            Slider(value: Binding(get: { value }, set: { v in change { set(&$0, (v / step).rounded() * step) } }), in: range, step: step)
                .frame(width: 180).tint(Ink.primary)
            Text(step < 1 ? String(format: "%.1f\(unit)", value) : "\(Int(value))\(unit)")
                .font(.system(size: 13, weight: .semibold)).monospacedDigit().frame(width: 64, alignment: .trailing)
        }
    }

    private func heading(_ title: String) -> some View {
        Text(title).font(.system(size: 13, weight: .semibold)).foregroundStyle(Ink.tertiary).padding(.top, 6)
    }

    var body: some View {
        let s = hub.settings, n = s.native
        ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 9) {
                heading("Notch")
                row("Screens", [("Automatic", NotchSettings.Display.automatic), ("Built-in", .builtin), ("Main", .main), ("All", .all)], s.display) { $0.display = $1 }
                row("Opens on", [("Hover", true), ("Click", false)], s.openOnHover) { $0.openOnHover = $1 }
                slider("Open after", Double(s.hoverDelay) / 1000, 0.1...1.0, step: 0.05, unit: " s") { $0.hoverDelay = Int(($1 * 1000).rounded()) }
                slider("Close after", Double(s.closeDelay) / 1000, 0.1...2.0, step: 0.05, unit: " s") { $0.closeDelay = Int(($1 * 1000).rounded()) }
                row("Size", [("Compact", N.Size.compact), ("Spacious", .spacious), ("Custom", .custom)], n.size) { $0.native.size = $1 }
                if n.size == .custom {
                    slider("Width", n.customWidth, N.widthRange, step: 10) { $0.native.customWidth = $1 }
                    slider("Maximum height", n.customHeight, N.heightRange, step: 10) { $0.native.customHeight = $1 }
                }
                row("Background", [("Black", false), ("Glass", true)], n.glass) { $0.native.glass = $1 }
                onOff("Outline", n.outline) { $0.native.outline = $1 }
                row("Ox sits", [("Left", true), ("Right", false)], s.mascotLeft) { $0.mascotLeft = $1 }
                row("While nothing is happening", [("Ox", true), ("Nothing", false)], s.idleOx) { $0.idleOx = $1 }
                row("Screens without a notch", [("Capsule", 0), ("Notch shape", 1), ("Nothing", 2)],
                    !s.pillWithoutNotch ? 2 : n.shape == .notch ? 1 : 0) { s, v in
                    s.pillWithoutNotch = v != 2
                    if v != 2 { s.native.shape = v == 1 ? .notch : .capsule }
                }
                if s.pillWithoutNotch && n.shape == .capsule {
                    slider("Capsule width", n.capsuleWidth, N.capsuleWidthRange, step: 1) { $0.native.capsuleWidth = $1 }
                    slider("Capsule height", n.capsuleHeight, N.capsuleHeightRange, step: 1) { $0.native.capsuleHeight = $1 }
                    slider("Capsule from top", n.capsuleDrop, N.capsuleDropRange, step: 1) { $0.native.capsuleDrop = $1 }
                }
                slider("Camera fit, width", n.cameraWidth, N.cameraWidthRange, step: 1) { $0.native.cameraWidth = $1 }
                slider("Camera fit, height", n.cameraHeight, N.cameraHeightRange, step: 0.5) { $0.native.cameraHeight = $1 }
                row("Over full-screen apps", [("Show", true), ("Hide", false)], s.overFullScreen) { $0.overFullScreen = $1 }
                row("In screenshots and sharing", [("Show", true), ("Hide", false)], s.inCaptures) { $0.inCaptures = $1 }

                Rule().padding(.vertical, 4)
                heading("What it shows")
                onOff("Ox’s answers", s.showAnswer) { $0.showAnswer = $1 }
                onOff("Now playing", s.showMusic) { $0.showMusic = $1 }
                onOff("Timers", s.showTimers) { $0.showTimers = $1 }
                onOff("Ask", s.showAsk) { $0.showAsk = $1 }

                Rule().padding(.vertical, 4)
                heading("Agents")
                ForEach(Provider.allCases) { p in
                    HStack(spacing: 8) {
                        AgentMark(provider: p, size: 13, nameIfMissing: false)
                        onOff(p.name, n.agents.contains(p)) { s, on in if on { s.native.agents.insert(p) } else { s.native.agents.remove(p) } }
                    }
                }
                onOff("Working agent in the closed notch", n.live) { $0.native.live = $1 }
                row("Beside its mark", [("Time", N.Readout.elapsed), ("Tokens", .tokens), ("Limit", .limit)], n.readout) { $0.native.readout = $1 }
                row("Limits as", [("Left", N.LimitDisplay.remaining), ("Used", .used)], n.limitDisplay) { $0.native.limitDisplay = $1 }
                row("Limit to show", [("Most used", N.LimitFocus.mostUsed), ("5-hour", .session), ("Week", .weekly)], n.limitFocus) { $0.native.limitFocus = $1 }
                onOff("Tell me when an agent finishes", n.finishAlert) { $0.native.finishAlert = $1 }
                if n.finishAlert {
                    row("After a turn of", [("Any length", 0), ("1 min", 1), ("5 min", 5), ("15 min", 15)], n.finishMinimum) { $0.native.finishMinimum = $1 }
                }
                onOff("Tell me when a plan is nearly used", n.limitAlert) { $0.native.limitAlert = $1 }
                if n.limitAlert {
                    row("At", [("75%", 75), ("90%", 90), ("95%", 95)], n.limitThreshold) { $0.native.limitThreshold = $1 }
                }
            }
            .padding(.bottom, 8)
        }
    }
}

// MARK: - Side buttons

/// Ported from Vorssaint's NotchQuickAccessLayout: up to three buttons a side that come out from under the open
/// island's edge on a spring (from 14 points inside it to 12 points beside it, growing from 40%), rows 44 points
/// apart starting level with the page. Vorssaint's are symbols in circles; OXBOT's are words.
struct SideButtons: View {
    @ObservedObject var hub: Hub
    @ObservedObject var state: IslandState
    let actions: Actions
    let geometry: Geometry

    private struct Item { let title: String; let selected: Bool; let action: () -> Void }

    private var left: [Item] {
        [Item(title: "Ox", selected: state.page == .ox, action: { actions.page(.ox) }),
         Item(title: "Music", selected: state.page == .music, action: { actions.page(.music) }),
         Item(title: "Agents", selected: state.page == .agents, action: { actions.page(.agents) })]
    }
    private var right: [Item] {
        (hub.settings.showAsk ? [Item(title: "Ask", selected: state.page == .ask, action: { actions.page(.ask) })] : [])
        + [Item(title: "OXBOT", selected: false, action: actions.dashboard),
           Item(title: state.pinned ? "Unpin" : "Pin", selected: state.pinned, action: actions.pin)]
    }

    var body: some View {
        let size = CGSize(width: geometry.openWidth, height: geometry.openHeight(state.page, hub))
        let island = geometry.body(size)
        let p = state.buttons
        ZStack(alignment: .topLeading) {
            ForEach(Array(left.enumerated()), id: \.offset) { i, item in
                bubble(item).position(center(i, item, edge: island.minX, top: island.minY, left: true, progress: p))
            }
            ForEach(Array(right.enumerated()), id: \.offset) { i, item in
                bubble(item).position(center(i, item, edge: island.maxX, top: island.minY, left: false, progress: p))
            }
        }
        .frame(width: geometry.panel.width, height: geometry.panel.height, alignment: .topLeading)
        .opacity(Double(p))
        .allowsHitTesting(p > 0.9)
        .accessibilityHidden(p < 0.9)
    }

    static func width(_ title: String) -> CGFloat { Metrics.text(title) + 28 }

    private func center(_ i: Int, _ item: Item, edge: CGFloat, top: CGFloat, left: Bool, progress: CGFloat) -> CGPoint {
        let w = Self.width(item.title)
        let phase = min(1.1, max(0, progress))
        let offset = -14 + phase * (14 + Metrics.buttonGap + w / 2)
        return CGPoint(x: edge + (left ? -offset : offset), y: top + geometry.header + Metrics.buttonHeight / 2 + 6 + CGFloat(i) * Metrics.buttonRows)
    }

    private func bubble(_ item: Item) -> some View {
        Button(action: item.action) {
            Text(item.title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(item.selected ? Color.black : Ink.primary)
                .frame(width: Self.width(item.title), height: Metrics.buttonHeight)
                .background {
                    if item.selected { RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Ink.primary) }
                    else { ZStack { Glass(); Color.black.opacity(0.55) }.clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous)) }
                }
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Ink.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .scaleEffect(0.4 + 0.6 * state.buttons)
    }
}
