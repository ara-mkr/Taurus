// SPDX-License-Identifier: GPL-3.0-or-later
// OXBOT's notch, drawn the way Vorssaint draws its Dynamic Island (owner, November 17, 2026: "ui should be practicly
// identical js oxbot taurus logo instead of vorssant ... the exact formatting on notch ... the little circle buttons
// hovering beside the notch, the same font"). Ported from Vorssaint's NotchView.swift, NotchQuickAccessView.swift,
// NotchComponents.swift, NotchSectionsView.swift, NotchMusicView.swift, NotchMusicStrip.swift, NotchAgentStrip.swift,
// NotchAgentsView.swift and NotchAgentComponents.swift (Copyright (C) 2026 Vorssaint): the same silhouette, insets,
// type sizes, circle buttons and their drops, cards and colours. Ox replaces Vorssaint's mascot; nothing else of its
// branding is used. See NOTICE.

import SwiftUI
import AppKit

enum Ink {
    static let primary = Color.white
    static let secondary = Color.white.opacity(0.55)
    static let tertiary = Color.white.opacity(0.4)
    static let signal = Color.red
    static let line = Color.white.opacity(0.1)
}

/// What the island's buttons do; the controller fills these in for each island.
struct Actions {
    var open: (Page?) -> Void
    var close: () -> Void
    var page: (Page) -> Void
    var pin: () -> Void
    /// Brings OXBOT's window forward, on a page ("notch" is Settings > Notch) or where it was.
    var dashboard: (String?) -> Void
    var save: (NotchSettings) -> Void
    var music: (String) -> Void
    var ask: () -> Void
    var cancelTimer: (String) -> Void
    var answerRing: (String) -> Void
    var startTimer: (Int) -> Void
    var drop: ([URL]) -> Void
    var addFiles: () -> Void
    var removeFile: (URL) -> Void
    var askAbout: (URL) -> Void
    /// Lets the island take typing (Ask, Notes) without bringing any app forward.
    var focusKeyboard: () -> Void
}

// MARK: - Layout (Vorssaint's NotchLayout and NotchQuickAccessLayout)

enum Metrics {
    static let diameter: CGFloat = 44
    static let gap: CGFloat = 12
    static let rowSpacingButtons: CGFloat = 54
    /// Room beside the open island for its circles: Vorssaint's gutter.
    static let gutter: CGFloat = 72
    static let horizontalInset: CGFloat = 28
    static let bottomInset: CGFloat = 16
    static let rowSpacing: CGFloat = 10
    static let sectionTileHeight: CGFloat = 86
    static let sectionSpacing: CGFloat = 8
    static func text(_ s: String, size: CGFloat = 12, weight: NSFont.Weight = .medium) -> CGFloat {
        ceil((s as NSString).size(withAttributes: [.font: NSFont.monospacedDigitSystemFont(ofSize: size, weight: weight)]).width)
    }
}

/// Where an island sits on one display: hanging from the top edge around a camera (or, by setting, from any top
/// edge), or floating as a capsule in the menu bar. Vorssaint's sizes: Compact 480, Spacious 560, or Custom.
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
        panel = CGSize(width: openWidth + 2 * Metrics.gutter + 24, height: maxHeight + 40)
    }

    /// The open island's top row: beside the camera, or Vorssaint's 36-point header on a capsule.
    var header: CGFloat { notched ? max(top, 32) : 36 }
    var stripHeight: CGFloat { top }
    var mascot: CGFloat { notched ? max(11, (min(top, 38) * 0.4).rounded()) : 12 }
    var maxContent: CGFloat { maxHeight - header - Metrics.rowSpacing - Metrics.bottomInset }

    func content(_ page: Page, _ hub: Hub) -> CGFloat {
        let cardRows = CGFloat((AgentCards.count(hub) + 1) / 2)
        let natural: CGFloat
        switch page {
        case .ox: natural = 150
        case .music: natural = hub.track == nil ? 70 : 56 + Metrics.rowSpacing + 14 + Metrics.rowSpacing + 44
        case .agents: natural = max(1, cardRows) * 86 + (max(1, cardRows) - 1) * 8
        case .ask: natural = 140
        case .camera: natural = 260
        case .files: natural = 84 + CGFloat(min(6, hub.shelf.count)) * 34
        case .timers: natural = 64 + CGFloat(max(1, hub.timers.count)) * 34
        case .notes: natural = 200
        case .system: natural = 118
        case .all: natural = 2 * Metrics.sectionTileHeight + Metrics.sectionSpacing
        }
        return min(natural, maxContent)
    }
    func openHeight(_ page: Page, _ hub: Hub) -> CGFloat { header + Metrics.rowSpacing + content(page, hub) + Metrics.bottomInset }

    func closedSize(_ hub: Hub) -> CGSize {
        let strip = Strip.of(hub)
        if notched {
            let wing = strip.wing(hub, mascot: mascot)
            return CGSize(width: camera + 2 * wing, height: top)
        }
        let w = strip.capsuleWidth(hub, mascot: mascot)
        guard w > 0 else { return .zero }
        return CGSize(width: max(top, w + capsuleWidth), height: top)
    }

    func size(_ hub: Hub, _ state: IslandState) -> CGSize {
        state.open ? CGSize(width: openWidth, height: openHeight(state.page, hub)) : closedSize(hub)
    }

    /// The island's rectangle in the panel, top-left origin.
    func body(_ size: CGSize) -> CGRect { CGRect(x: (panel.width - size.width) / 2, y: gap, width: size.width, height: size.height) }
}

/// What the closed island shows (Vorssaint's compact activity, or the resting strip when there is none).
enum Strip: Equatable {
    case ring, notice(Hub.Notice), voice(Voice.Phase), agent(Provider, Date), music, timer(Date), resting

    static func of(_ hub: Hub) -> Strip {
        if hub.ring != nil { return .ring }
        if let n = hub.notice { return .notice(n) }
        // Listening and thinking out loud are shown by Ox at the bottom of the screen, not here (owner, November 19,
        // 2026: "why does it also say listening the ox is alr chilling at the bottom").
        if hub.settings.native.live, let w = hub.workingAgents.first { return .agent(w.provider, w.work.since) }
        if let t = hub.track, t.playing { return .music }
        if hub.settings.showTimers, let t = hub.timers.first(where: { $0.endsAt > Date() }) { return .timer(t.endsAt) }
        return .resting
    }

    /// The readout beside the camera, as text, for sizing.
    func readout(_ hub: Hub) -> String? {
        switch self {
        case .ring: return "Needs you"
        case .notice(let n): return n.text
        case .voice(let p): return p == .listening ? "Listening" : "Thinking"
        case .agent(let p, let since): return AgentReadout.widest(p, since: since, hub: hub)
        case .timer(let end): return end.timeIntervalSinceNow > 3000 ? "0:00:00" : "00:00"
        case .music, .resting: return nil
        }
    }

    /// Both wings of a notched strip are as wide as the wider one, so it stays centred on the camera.
    func wing(_ hub: Hub, mascot: CGFloat) -> CGFloat {
        let oxWing = OxMark.width(for: mascot) + 22
        switch self {
        case .resting:
            let r = hub.settings.native.resting
            if r == .none { return hub.settings.idleOx ? oxWing : 0 }
            return max(oxWing, r == .battery ? 46 : 40)
        case .music: return 40
        default:
            let text = min(170, Metrics.text(readout(hub) ?? ""))
            return max(oxWing, text + 22)
        }
    }

    func capsuleWidth(_ hub: Hub, mascot: CGFloat) -> CGFloat {
        let ox = OxMark.width(for: mascot)
        switch self {
        case .resting:
            if hub.settings.native.resting == .none { return hub.settings.idleOx ? ox + 28 : 0 }
            return ox + 28 + 44
        case .music: return 28 + 22 + 8 + 16
        default: return ox + 28 + 8 + min(170, Metrics.text(readout(hub) ?? ""))
        }
    }
}

/// What the closed island says beside a working agent's mark (Vorssaint's NotchAgentReadout).
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
        display == .remaining ? "\(Int((100 - w.usedPercent).rounded()))%" : "\(Int(w.usedPercent.rounded()))%"
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
    /// Where Explore goes back to.
    @Published var lastPage: Page = .ox
    @Published var pinned = false
    /// The circles' way out, 0 tucked under the island to 1 beside it.
    @Published var buttons: CGFloat = 0
    @Published var askText = ""
    @Published var askBusy = false
    @Published var askAnswer: String?
    @Published var askError: String?
    @Published var askFiles: [URL] = []
    init(display: NotchDisplay) { self.display = display }
    func geometry(_ s: NotchSettings) -> Geometry { Geometry(display: display, settings: s) }
}

// MARK: - Shared pieces (Vorssaint's NotchComponents)

/// Vorssaint's NotchButtonStyle: a light wash under the pointer, a small lift, a press.
struct NotchButtonStyle: ButtonStyle {
    var cornerRadius: CGFloat = 10
    var lifts = true
    var highlights = true
    @State private var hovered = false
    @Environment(\.isEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        let active = enabled && hovered
        configuration.label
            .overlay {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(.white.opacity(active && highlights ? 0.09 : 0)).allowsHitTesting(false)
            }
            .opacity(enabled ? (configuration.isPressed ? 0.8 : 1) : 0.4)
            .scaleEffect(reduceMotion || !lifts ? 1 : configuration.isPressed ? 0.965 : (active ? 1.022 : 1))
            .animation(reduceMotion ? nil : .spring(response: 0.28, dampingFraction: 0.7), value: configuration.isPressed)
            .animation(reduceMotion ? nil : .spring(response: 0.32, dampingFraction: 0.75), value: hovered)
            .onHover { hovered = $0 }
    }
}

/// Vorssaint's NotchIconButton: a 28-point symbol button for the top row.
struct NotchIconButton: View {
    let symbol: String
    let title: String
    var selected = false
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(selected ? .white : .white.opacity(0.55))
                .frame(width: 28, height: 28)
                .background(.white.opacity(selected ? 0.12 : 0), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                .contentShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
        }
        .buttonStyle(NotchButtonStyle(cornerRadius: 9))
        .help(title)
        .accessibilityLabel(title)
    }
}

/// A text button in the island, as Vorssaint's small bordered actions.
struct WordButton: View {
    let title: String
    var action: () -> Void
    init(_ title: String, action: @escaping () -> Void) { self.title = title; self.action = action }
    var body: some View {
        Button(action: action) {
            Text(title).font(.system(size: 11, weight: .medium))
                .padding(.horizontal, 9).frame(height: 24)
                .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(NotchButtonStyle(cornerRadius: 8))
    }
}

/// Vorssaint's NotchControlSurface: the cards' surface.
struct CardSurface: ViewModifier {
    var cornerRadius: CGFloat = 18
    var selected = false
    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        return content
            .background(.white.opacity(selected ? 0.11 : 0.045), in: shape)
            .overlay { shape.strokeBorder(.white.opacity(selected ? 0.16 : 0.065), lineWidth: 0.5).allowsHitTesting(false) }
    }
}

/// Vorssaint's NotchEmptyView: a glyph beside its message.
struct EmptyMessage: View {
    let symbol: String
    let message: String
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbol).font(.system(size: 22, weight: .light)).foregroundStyle(.secondary).frame(width: 30)
            Text(message).font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// Vorssaint's NotchLiveEqualizerBars: rounded bars that move while music plays and rest flat while paused.
struct Bars: View {
    var playing: Bool
    var bars = 3
    var barWidth: CGFloat = 2
    var height: CGFloat = 11
    var tint: Color = .white
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 24, paused: !playing || reduceMotion)) { c in
            let t = c.date.timeIntervalSinceReferenceDate
            HStack(alignment: .center, spacing: barWidth) {
                ForEach(0..<bars, id: \.self) { i in
                    let wave = playing && !reduceMotion ? 0.3 + 0.7 * abs(sin(t * (3.3 + Double(i) * 1.17) + Double(i) * 0.9)) : 0.22
                    Capsule().fill(tint).frame(width: barWidth, height: max(barWidth, height * wave))
                }
            }
            .frame(height: height)
        }
        .accessibilityHidden(true)
    }
}

struct Artwork: View {
    let image: NSImage?
    let size: CGFloat
    var radius: CGFloat = 10
    var body: some View {
        Group {
            if let image { Image(nsImage: image).resizable().aspectRatio(contentMode: .fill) }
            else { ZStack { Color.white.opacity(0.08); Image(systemName: "music.note").font(.system(size: size * 0.38)).foregroundStyle(.secondary) } }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
    }
}

/// The average colour of a cover, as Vorssaint tints the closed music strip's bars.
enum ArtworkTint {
    private static var cache: [ObjectIdentifier: Color] = [:]
    static func of(_ image: NSImage?) -> Color {
        guard let image else { return .white }
        if let c = cache[ObjectIdentifier(image)] { return c }
        var color = Color.white
        if let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
           let small = rep.colorAt(x: rep.pixelsWide / 2, y: rep.pixelsHigh / 2) {
            // Lifted so it reads on black, as Vorssaint's tint is.
            let rgb = small.usingColorSpace(.deviceRGB) ?? small
            var h: CGFloat = 0, s: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
            rgb.getHue(&h, saturation: &s, brightness: &b, alpha: &a)
            color = s < 0.15 ? .white : Color(hue: h, saturation: min(0.75, s), brightness: max(0.8, b))
        }
        cache[ObjectIdentifier(image)] = color
        return color
    }
}

extension Provider {
    /// Vorssaint's agent colours.
    var tint: Color {
        switch self {
        case .claude: return Color(red: 0.85, green: 0.47, blue: 0.34)
        case .codex: return Color(red: 0.49, green: 0.60, blue: 1.0)
        case .opencode: return Color(red: 0.06, green: 0.73, blue: 0.51)
        case .copilot: return Color(red: 0.30, green: 0.78, blue: 0.68)
        }
    }
}

/// Green reads as fine and red as trouble only when it earns it (Vorssaint's agentLimitTint).
func limitTint(_ provider: Provider, usedFraction: Double) -> Color {
    if usedFraction >= 0.95 { return .red }
    if usedFraction >= 0.8 { return .orange }
    return provider.tint
}

extension Page {
    /// Vorssaint's section symbols; Ox's own page wears Ox.
    var symbol: String {
        switch self {
        case .ox: return "circle"
        case .music: return "music.note"
        case .agents: return "sparkles"
        case .ask: return "bubble.left"
        case .camera: return "web.camera"
        case .files: return "tray.full"
        case .timers: return "timer"
        case .notes: return "note.text"
        case .system: return "gauge.with.dots.needle.50percent"
        case .all: return "square.grid.2x2"
        }
    }
    var tint: Color {
        switch self {
        case .music: return .pink
        case .timers: return .orange
        default: return .white.opacity(0.85)
        }
    }
}

// MARK: - The island

/// Vorssaint's NotchShape: hanging from the top edge, the top corners flare out into the menu bar and the bottom
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

/// The system's own material, for Vorssaint's translucent background.
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
        let radius: CGFloat = g.notched ? (state.open ? 32 : 10) : (state.open ? 32 : size.height / 2)
        let shape = IslandShape(notched: g.notched, flare: flare, radius: radius)
        let glass = n.glass && state.open
        ZStack(alignment: .topLeading) {
            QuickAccess(hub: hub, state: state, actions: actions, geometry: g)
            ZStack(alignment: .top) {
                Group { if glass { ZStack { Glass(); Color.black.opacity(0.35) } } else { Color.black } }
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
            .onDrop(of: [.fileURL], isTargeted: nil) { providers in
                for provider in providers {
                    _ = provider.loadObject(ofClass: URL.self) { url, _ in
                        if let url, url.isFileURL { DispatchQueue.main.async { actions.drop([url]) } }
                    }
                }
                return !providers.isEmpty
            }
            .contextMenu { if state.open { IslandMenu(state: state, actions: actions) } }
            .opacity(size.width < 1 ? 0 : 1)
            .position(x: g.panel.width / 2, y: g.gap + size.height / 2)
        }
        .frame(width: g.panel.width, height: g.panel.height, alignment: .topLeading)
        .animation(state.open ? .spring(duration: 0.42, bounce: 0.18) : .spring(duration: 0.3, bounce: 0), value: state.open)
        .animation(.spring(duration: 0.34, bounce: 0.12), value: state.page)
        .animation(.spring(duration: 0.3, bounce: 0.1), value: size)
        .foregroundStyle(.white)
        .tint(.white)
        .environment(\.colorScheme, .dark)
        .onExitCommand { actions.close() }
    }
}

/// Vorssaint's island menu, a secondary click away: Explore, Keep open, Settings, Collapse; and OXBOT.
struct IslandMenu: View {
    @ObservedObject var state: IslandState
    let actions: Actions
    var body: some View {
        Button { actions.page(state.page == .all ? state.lastPage : .all) } label: { Label(state.page == .all ? "Back" : "Explore", systemImage: "square.grid.2x2") }
        Button(action: actions.pin) { Label(state.pinned ? "Allow automatic closing" : "Keep open", systemImage: state.pinned ? "pin.slash" : "pin") }
        Button { actions.dashboard(nil) } label: { Label("Open OXBOT", systemImage: "macwindow") }
        Button { actions.dashboard("notch") } label: { Label("Settings…", systemImage: "gearshape") }
        Divider()
        Button(action: actions.close) { Label("Collapse", systemImage: "chevron.up") }
    }
}

// MARK: - Closed (Vorssaint's NotchRestingStrip and compact activity strips)

struct ClosedContent: View {
    @ObservedObject var hub: Hub
    let geometry: Geometry
    let size: CGSize

    var body: some View {
        let strip = Strip.of(hub)
        if geometry.notched {
            let wing = max(0, (size.width - geometry.camera) / 2)
            HStack(spacing: 0) {
                leading(strip).padding(.leading, 9).frame(width: wing, height: geometry.top, alignment: .leading)
                Color.clear.frame(width: geometry.camera)
                trailing(strip).padding(.trailing, 9).frame(width: wing, height: geometry.top, alignment: .trailing)
            }
            .frame(height: geometry.top)
        } else {
            HStack(spacing: 8) {
                leading(strip)
                Spacer(minLength: 0)
                trailing(strip)
            }
            .padding(.horizontal, 12)
            .frame(height: geometry.top)
        }
    }

    private var ox: some View {
        let mood: OxMark.Mood = hub.voice?.phase == .listening ? .listening : hub.voice?.phase == .thinking ? .thinking : .rest
        return OxMark(height: geometry.mascot, mood: mood, charges: hub.charges, color: .white.opacity(0.9))
    }
    private var cover: CGFloat { min(22, geometry.top - 8) }

    @ViewBuilder private func leading(_ strip: Strip) -> some View {
        switch strip {
        case .agent:
            HStack(spacing: 1) { ForEach(hub.workingAgents.map(\.provider).uniqued().prefix(3), id: \.self) { AgentMark(provider: $0, size: 13, tint: $0.tint) } }
        case .notice(let n): AgentMark(provider: n.provider, size: 13, tint: n.provider.tint)
        case .music: Artwork(image: hub.track?.artwork, size: cover, radius: 5)
        case .resting:
            let r = hub.settings.native.resting
            if hub.settings.idleOx && hub.settings.mascotLeft { ox }
            else if r == .music, let a = hub.track?.artwork { Artwork(image: a, size: cover, radius: 5) }
            else if r == .battery, let b = Power.battery() { Image(systemName: Power.symbol(b)).font(.system(size: 12)).foregroundStyle(Power.tint(b)) }
            else if r == .agents { RestingAgents(hub: hub) }
            else if hub.settings.idleOx { ox }
        default: ox
        }
    }

    @ViewBuilder private func trailing(_ strip: Strip) -> some View {
        Group {
            switch strip {
            case .ring: Text("Needs you").foregroundStyle(.red)
            case .notice(let n): Text(n.text).lineLimit(1).frame(maxWidth: 170, alignment: .trailing)
            case .voice(let p): Text(p == .listening ? "Listening" : "Thinking").foregroundStyle(p == .listening ? .white : .white.opacity(0.6))
            case .agent(let p, let since):
                TimelineView(.periodic(from: .now, by: 1)) { c in Text(AgentReadout.text(p, since: since, at: c.date, hub: hub)) }
            case .music: Bars(playing: hub.track?.playing == true, bars: 3, barWidth: 2, height: 11, tint: ArtworkTint.of(hub.track?.artwork))
            case .timer(let end):
                TimelineView(.periodic(from: .now, by: 1)) { c in Text(clock(end.timeIntervalSince(c.date))).foregroundStyle(.orange) }
            case .resting:
                let r = hub.settings.native.resting
                if hub.settings.idleOx && !hub.settings.mascotLeft { ox }
                else if r == .music, hub.track != nil { Bars(playing: hub.track?.playing == true, bars: 3, barWidth: 2, height: 11, tint: ArtworkTint.of(hub.track?.artwork)) }
                else if r == .battery, let b = Power.battery() { Text("\(b.percent)%").font(.system(size: 9, weight: .medium)).foregroundStyle(Power.tint(b)) }
                else if r == .agents { RestingAgents(hub: hub, readout: true) }
            }
        }
        .font(.system(size: 12, weight: .medium))
        .monospacedDigit()
        .lineLimit(1)
        .fixedSize()
    }
}

/// Vorssaint's NotchAgentRestingWing: the tracked agents' marks, and the most used plan window.
struct RestingAgents: View {
    @ObservedObject var hub: Hub
    var readout = false
    var body: some View {
        let shown = hub.trackedAgents.filter { $0.lastActive != nil }
        if readout {
            if let a = shown.first(where: { !$0.limits.isEmpty }), let w = AgentReadout.window(a, hub.settings.native.limitFocus) {
                Text(AgentReadout.limit(w, hub.settings.native.limitDisplay)).foregroundStyle(limitTint(a.provider, usedFraction: w.usedPercent / 100))
            }
        } else {
            HStack(spacing: 1) { ForEach(shown.prefix(2), id: \.provider) { AgentMark(provider: $0.provider, size: 11, tint: $0.provider.tint) } }
        }
    }
}

extension Array where Element: Hashable {
    func uniqued() -> [Element] { var seen = Set<Element>(); return filter { seen.insert($0).inserted } }
}

// MARK: - Open (Vorssaint's expanded island: no page title, the page's controls in the row beside the camera)

struct OpenContent: View {
    @ObservedObject var hub: Hub
    @ObservedObject var state: IslandState
    let actions: Actions
    let geometry: Geometry

    var body: some View {
        VStack(alignment: .leading, spacing: Metrics.rowSpacing) {
            band.frame(height: geometry.header)
            Group {
                switch state.page {
                case .ox: OxPage(hub: hub, actions: actions)
                case .music: MusicPage(hub: hub, actions: actions)
                case .agents: AgentsPage(hub: hub)
                case .ask: AskPage(state: state, actions: actions)
                case .camera: CameraPage()
                case .files: FilesPage(hub: hub, actions: actions)
                case .timers: TimersPage(hub: hub, actions: actions)
                case .notes: NotesPage(hub: hub, actions: actions)
                case .system: SystemPage()
                case .all: SectionsPage(state: state, actions: actions)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .padding(.horizontal, Metrics.horizontalInset)
        .padding(.bottom, Metrics.bottomInset)
    }

    /// The row: the way to Explore (or back) leads it, the pin mark ends it, beside the camera where they fit.
    private var band: some View {
        HStack(spacing: 6) {
            if state.page == .all {
                NotchIconButton(symbol: "chevron.left", title: "Back") { actions.page(state.lastPage) }
            } else {
                NotchIconButton(symbol: "square.grid.2x2", title: "Explore") { actions.page(.all) }
            }
            if state.page == .ox { OxStatus(hub: hub, geometry: geometry) }
            Spacer(minLength: 0)
            if geometry.notched { Color.clear.frame(width: geometry.camera) }
            Spacer(minLength: 0)
            if state.page == .agents { ForEach(hub.workingAgents.map(\.provider).uniqued(), id: \.self) { AgentMark(provider: $0, size: 12, tint: $0.tint) } }
            if state.page == .files { NotchIconButton(symbol: "plus", title: "Add files", action: actions.addFiles) }
            if state.pinned { NotchIconButton(symbol: "pin.fill", title: "Allow automatic closing", selected: true, action: actions.pin) }
        }
    }
}

/// Ox and what he is doing, in the row on his own page.
struct OxStatus: View {
    @ObservedObject var hub: Hub
    let geometry: Geometry
    var body: some View {
        let phase = hub.recentVoice?.phase
        let mood: OxMark.Mood = phase == .listening ? .listening : phase == .thinking ? .thinking : .rest
        HStack(spacing: 7) {
            OxMark(height: 12, mood: mood, charges: hub.charges)
            Text(!hub.connected ? "Offline" : phase == .listening ? "Listening" : phase == .thinking ? "Thinking"
                 : (!hub.running.isEmpty || !hub.workingAgents.isEmpty) ? "Working" : "Idle")
                .font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary)
        }
    }
}

struct Rule: View { var body: some View { Rectangle().fill(Ink.line).frame(height: 0.5) } }

struct OxPage: View {
    @ObservedObject var hub: Hub
    let actions: Actions

    private var headline: (text: String, tone: Color) {
        if !hub.connected { return ("OXBOT isn’t running", .white) }
        if let v = hub.recentVoice {
            switch v.phase {
            case .listening: return ("Listening", .white)
            case .thinking: return ("Thinking", .white)
            case .answer where hub.settings.showAnswer: return (v.text ?? "Done", .white)
            case .error: return (v.text ?? "That didn’t work", .red)
            default: break
            }
        }
        if let a = hub.running.last { return (a.text, .white) }
        return ("Nothing running", .white.opacity(0.55))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let ring = hub.ring {
                HStack {
                    Text(ring.title).font(.system(size: 13, weight: .semibold)).foregroundStyle(.red).lineLimit(1)
                    Spacer()
                    WordButton("I’m on it") { actions.answerRing(ring.id) }
                }
            }
            Text(headline.text).font(.system(size: 14, weight: .semibold)).foregroundStyle(headline.tone).lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)
            if let said = hub.recentVoice?.said, !said.isEmpty {
                Text("“\(said)”").font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
            }
            ForEach(Array(hub.activity.suffix(3).reversed())) { a in
                HStack(spacing: 6) {
                    Image(systemName: a.state == "running" ? "circle.dotted" : a.state == "failed" ? "exclamationmark.circle" : "checkmark.circle")
                        .font(.system(size: 10, weight: .semibold)).foregroundStyle(a.state == "failed" ? .red : .secondary).frame(width: 12)
                    Text(a.text).font(.system(size: 11)).foregroundStyle(.white.opacity(0.85)).lineLimit(1)
                }
            }
            if hub.settings.showTimers {
                ForEach(hub.timers) { t in
                    HStack(spacing: 6) {
                        Image(systemName: "timer").font(.system(size: 10, weight: .semibold)).foregroundStyle(.orange).frame(width: 12)
                        Text(t.label).font(.system(size: 11)).lineLimit(1)
                        Spacer()
                        TimelineView(.periodic(from: .now, by: 1)) { c in Text(clock(t.endsAt.timeIntervalSince(c.date))).font(.system(size: 11, weight: .medium)).monospacedDigit().foregroundStyle(.orange) }
                    }
                }
            }
        }
    }
}

/// Vorssaint's player: the cover and the song, the timeline across the island, then one row of buttons.
struct MusicPage: View {
    @ObservedObject var hub: Hub
    let actions: Actions
    var body: some View {
        if let t = hub.track {
            VStack(spacing: Metrics.rowSpacing) {
                HStack(alignment: .bottom, spacing: 14) {
                    Artwork(image: t.artwork, size: 56, radius: 56 * 0.19)
                        .scaleEffect(t.playing ? 1 : 0.94)
                        .animation(.smooth(duration: 0.3), value: t.playing)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(t.title).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                        Text(t.artist.isEmpty ? t.app : t.artist).font(.system(size: 13)).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Spacer(minLength: 8)
                    Bars(playing: t.playing, bars: 4, barWidth: 2.5, height: 15, tint: .white.opacity(0.5)).padding(.bottom, 4)
                }
                Timeline(track: t)
                GeometryReader { g in
                    let slot = g.size.width / 5
                    HStack(spacing: 0) {
                        Color.clear.frame(width: slot).overlay {
                            if let icon = Self.appIcon(t) { Image(nsImage: icon).resizable().frame(width: 18, height: 18).help(t.app) }
                        }
                        transport("backward.fill", 19, "Previous") { actions.music("previous") }.frame(width: slot)
                        transport(t.playing ? "pause.fill" : "play.fill", 28, "Play or pause") { actions.music("toggle") }.frame(width: slot)
                        transport("forward.fill", 19, "Next") { actions.music("next") }.frame(width: slot)
                        Color.clear.frame(width: slot)
                    }
                }
                .frame(height: 44)
            }
        } else {
            VStack(alignment: .leading, spacing: 2) {
                Text("Not Playing").font(.system(size: 14, weight: .semibold))
                Text(hub.settings.showMusic ? "Play something in Music, Spotify or a browser." : "Music is off in Settings.").font(.system(size: 13)).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func transport(_ symbol: String, _ size: CGFloat, _ title: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol).font(.system(size: size, weight: .semibold)).frame(width: 44, height: 44).contentShape(Rectangle())
        }
        .buttonStyle(NotchButtonStyle(cornerRadius: 22))
        .help(title)
        .accessibilityLabel(title)
    }

    static func appIcon(_ t: Track) -> NSImage? {
        guard t.fromSystem, let url = NSWorkspace.shared.runningApplications.first(where: { $0.localizedName == t.app })?.bundleURL else { return nil }
        return NSWorkspace.shared.icon(forFile: url.path)
    }
}

/// Vorssaint's timeline: elapsed, the bar, and what is left.
struct Timeline: View {
    let track: Track
    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { c in
            let at = track.position(at: c.date) ?? 0
            let d = track.duration ?? 0
            HStack(spacing: 8) {
                Text(clock(at))
                GeometryReader { g in
                    ZStack(alignment: .leading) {
                        Capsule().fill(.white.opacity(0.2))
                        Capsule().fill(.white).frame(width: d > 0 ? g.size.width * min(1, at / d) : 0)
                    }
                    .frame(height: 4).frame(maxHeight: .infinity)
                }
                Text("−" + clock(max(0, d - at)))
            }
            .font(.system(size: 10, weight: .medium)).monospacedDigit().foregroundStyle(.secondary)
        }
        .frame(height: 14)
    }
}

// MARK: - Agents (Vorssaint's NotchAgentsView cards)

enum AgentCards {
    static func shown(_ hub: Hub) -> [AgentUsage] {
        hub.trackedAgents.filter { $0.lastActive != nil || $0.tokensToday > 0 || !$0.limits.isEmpty }
    }
    /// One limits card per agent in use, and the Now card.
    static func count(_ hub: Hub) -> Int { shown(hub).count + 1 }
}

struct AgentsPage: View {
    @ObservedObject var hub: Hub
    var body: some View {
        let agents = AgentCards.shown(hub)
        if hub.trackedAgents.isEmpty || agents.isEmpty {
            EmptyMessage(symbol: "sparkles", message: "No usage from Claude Code, Codex, OpenCode or GitHub Copilot yet. It appears here as soon as any of them works on this Mac.")
        } else {
            ScrollView(.vertical, showsIndicators: false) {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                    LiveCard(hub: hub)
                    ForEach(agents, id: \.provider) { LimitsCard(usage: $0, display: hub.settings.native.limitDisplay) }
                }
            }
        }
    }
}

/// Vorssaint's NotchAgentCardChrome and NotchAgentCardHeader.
struct AgentCard<Accessory: View, Content: View>: View {
    let title: String
    var symbol: String? = nil
    var provider: Provider? = nil
    var tint: Color = .secondary
    @ViewBuilder var accessory: Accessory
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                if let provider { AgentMark(provider: provider, size: 13, tint: tint).frame(width: 17, height: 17) }
                else if let symbol { Image(systemName: symbol).font(.system(size: 10, weight: .semibold)).foregroundStyle(tint).frame(width: 13) }
                Text(title).font(.system(size: 10.5, weight: .semibold)).foregroundStyle(.white.opacity(0.9)).lineLimit(1)
                Spacer(minLength: 4)
                accessory
            }
            .frame(height: 17)
            content
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .frame(maxWidth: .infinity, minHeight: 86, maxHeight: 86, alignment: .topLeading)
        .modifier(CardSurface())
    }
}

/// Vorssaint's NotchAgentChip.
struct Chip: View {
    let text: String
    var tint: Color = .white
    var body: some View {
        Text(text).font(.system(size: 9, weight: .semibold)).foregroundStyle(tint.opacity(0.9)).lineLimit(1)
            .padding(.horizontal, 5).padding(.vertical, 1.5)
            .background(tint.opacity(0.14), in: Capsule(style: .continuous))
    }
}

struct LimitsCard: View {
    let usage: AgentUsage
    let display: NotchSettings.Native.LimitDisplay
    var body: some View {
        let p = usage.provider
        // Vorssaint's card shows the session window and the most used longer one.
        let session = usage.limits.first { ($0.minutes ?? .max) <= 720 }
        let longer = usage.limits.filter { ($0.minutes ?? .max) > 720 }.max { $0.usedPercent < $1.usedPercent }
        let windows = [session, longer].compactMap { $0 }
        AgentCard(title: p.name, provider: p, tint: p.tint) {
            HStack(spacing: 4) {
                if let plan = usage.plan { Chip(text: plan, tint: p.tint) }
                if !usage.working.isEmpty { Circle().fill(p.tint).frame(width: 5, height: 5) }
            }
        } content: {
            if windows.isEmpty {
                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Text("Today").font(.system(size: 10, weight: .medium)).foregroundStyle(.white.opacity(0.85))
                        Spacer()
                        Text(p == .copilot ? "\(usage.requestsToday) req" : AgentReadout.tokens(usage.tokensToday))
                            .font(.system(size: 12, weight: .semibold, design: .rounded)).monospacedDigit().foregroundStyle(p.tint)
                    }
                    Text(p == .copilot ? "Requests" : "Tokens").font(.system(size: 9.5)).foregroundStyle(.secondary)
                }
            } else {
                ForEach(Array(windows.enumerated()), id: \.offset) { _, w in
                    let used = w.usedPercent / 100
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(spacing: 5) {
                            Text(w.minutes.map { $0 <= 720 ? "Session" : "Week" } ?? "Plan").font(.system(size: 10, weight: .medium)).foregroundStyle(.white.opacity(0.85))
                            if let r = w.resetsAt { Label(countdown(r), systemImage: "arrow.clockwise").font(.system(size: 9.5)).foregroundStyle(.secondary).labelStyle(.titleAndIcon) }
                            Spacer(minLength: 2)
                            Text(AgentReadout.limit(w, display)).font(.system(size: 12, weight: .semibold, design: .rounded)).monospacedDigit()
                                .foregroundStyle(limitTint(p, usedFraction: used))
                        }
                        GeometryReader { g in
                            ZStack(alignment: .leading) {
                                Capsule().fill(.white.opacity(0.12))
                                Capsule().fill(limitTint(p, usedFraction: used)).frame(width: g.size.width * (display == .remaining ? 1 - used : used))
                            }
                        }
                        .frame(height: 3)
                    }
                }
            }
        }
    }

    private func countdown(_ d: Date) -> String {
        let m = max(0, Int(d.timeIntervalSinceNow / 60))
        return m >= 1440 ? "\(m / 1440)d \(m % 1440 / 60)h" : m >= 60 ? "\(m / 60)h \(m % 60)m" : "\(m)m"
    }
}

/// Vorssaint's Now card: what runs, for how long; or each agent's idle line.
struct LiveCard: View {
    @ObservedObject var hub: Hub
    var body: some View {
        let live = hub.workingAgents
        AgentCard(title: "Now", symbol: "waveform", tint: live.first?.provider.tint ?? .secondary) {
            HStack(spacing: 4) {
                if live.count > 2 { Chip(text: "+\(live.count - 2)") }
                if let first = live.first { Circle().fill(first.provider.tint).frame(width: 5, height: 5) }
            }
        } content: {
            if live.isEmpty {
                VStack(alignment: .leading, spacing: 5) {
                    Text("No session running").font(.system(size: 10.5)).foregroundStyle(.secondary)
                    if !hub.plans.isEmpty {
                        Text("Ox today: " + hub.plans.map { "\($0.name) \($0.callsToday)" }.joined(separator: ", "))
                            .font(.system(size: 9.5)).foregroundStyle(.secondary).lineLimit(2)
                    }
                }
            } else {
                TimelineView(.periodic(from: .now, by: 1)) { c in
                    VStack(alignment: .leading, spacing: 5) {
                        ForEach(Array(live.prefix(2).enumerated()), id: \.offset) { _, s in
                            HStack(spacing: 4) {
                                AgentMark(provider: s.provider, size: 9, tint: s.provider.tint)
                                Text(s.work.project).font(.system(size: 11, weight: .semibold)).lineLimit(1).truncationMode(.middle)
                                Spacer(minLength: 4)
                                Text(clock(c.date.timeIntervalSince(s.work.since))).font(.system(size: 11, weight: .medium)).monospacedDigit().foregroundStyle(s.provider.tint)
                            }
                        }
                    }
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
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "bubble.left").font(.system(size: 12, weight: .medium)).foregroundStyle(.secondary)
                TextField("Ask Ox", text: $state.askText).textFieldStyle(.plain).font(.system(size: 13)).focused($focused)
                    .onSubmit { actions.ask() }
                if state.askBusy { ProgressView().controlSize(.small) }
            }
            .padding(.horizontal, 10).frame(height: 32)
            .modifier(CardSurface(cornerRadius: 10))
            ForEach(state.askFiles, id: \.self) { url in
                HStack(spacing: 6) {
                    Image(systemName: "paperclip").font(.system(size: 10)).foregroundStyle(.secondary)
                    Text(url.lastPathComponent).font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1).truncationMode(.middle)
                    Spacer()
                    Button { state.askFiles.removeAll { $0 == url } } label: { Image(systemName: "xmark").font(.system(size: 9, weight: .semibold)) }
                        .buttonStyle(.plain).foregroundStyle(.secondary).help("Remove")
                }
            }
            if let e = state.askError { Text(e).font(.system(size: 12)).foregroundStyle(.red).lineLimit(2) }
            if let a = state.askAnswer {
                ScrollView { Text(a).font(.system(size: 13)).frame(maxWidth: .infinity, alignment: .leading).textSelection(.enabled) }
            }
        }
        .onAppear { actions.focusKeyboard(); DispatchQueue.main.async { focused = true } }
    }
}

// MARK: - Explore (Vorssaint's NotchSectionsView)

struct SectionsPage: View {
    @ObservedObject var state: IslandState
    let actions: Actions
    private let pages: [Page] = [.ox, .music, .agents, .ask, .camera, .files, .timers, .notes, .system]
    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: Metrics.sectionSpacing), count: 5), spacing: Metrics.sectionSpacing) {
            ForEach(pages, id: \.self) { p in tile(p.title, p, current: state.lastPage == p) { actions.page(p) } }
            tile("Settings", nil, current: false) { actions.dashboard("notch") }
        }
    }

    private func tile(_ title: String, _ page: Page?, current: Bool, _ action: @escaping () -> Void) -> some View {
        let shape = RoundedRectangle(cornerRadius: 16, style: .continuous)
        return Button(action: action) {
            VStack(spacing: 6) {
                Group {
                    if page == .ox { OxMark(height: 17, color: .white.opacity(0.85)) }
                    else { Image(systemName: page?.symbol ?? "gearshape").font(.system(size: 22, weight: .medium)).foregroundStyle(page?.tint ?? .white.opacity(0.85)) }
                }
                .frame(width: 25, height: 25)
                Text(title).font(.system(size: 11, weight: .medium)).lineLimit(2).multilineTextAlignment(.center)
            }
            .padding(.horizontal, 6)
            .frame(maxWidth: .infinity).frame(height: Metrics.sectionTileHeight)
            .background(.white.opacity(0.045), in: shape)
            .overlay { shape.strokeBorder(.white.opacity(0.04), lineWidth: 1) }
            .overlay(alignment: .topTrailing) {
                if current { Image(systemName: "checkmark.circle.fill").font(.system(size: 10)).foregroundStyle(.white.opacity(0.7)).padding(7) }
            }
            .contentShape(shape)
        }
        .buttonStyle(NotchButtonStyle(cornerRadius: 16, lifts: false))
        .help(title)
    }
}

// MARK: - The circles beside the island (Vorssaint's NotchQuickAccessView)

/// Up to three 44-point circles a side that come out from under the open island's edge on a spring, each on a
/// liquid drop whose neck dissolves as it leaves (Vorssaint's NotchQuickAccessLayout and NotchQuickAccessDrop).
struct QuickAccess: View {
    @ObservedObject var hub: Hub
    @ObservedObject var state: IslandState
    let actions: Actions
    let geometry: Geometry

    private struct Item { let page: Page?; let symbol: String; let title: String; let selected: Bool; let action: () -> Void }

    private var left: [Item] {
        [Item(page: .all, symbol: state.page == .all ? "arrow.uturn.backward" : "square.grid.2x2", title: state.page == .all ? "Back" : "Explore", selected: state.page == .all,
              action: { actions.page(state.page == .all ? state.lastPage : .all) }),
         Item(page: .ox, symbol: "", title: "Ox", selected: state.page == .ox, action: { actions.page(.ox) }),
         Item(page: .music, symbol: "music.note", title: "Music", selected: state.page == .music, action: { actions.page(.music) })]
    }
    private var right: [Item] {
        [Item(page: .agents, symbol: "sparkles", title: "Agents", selected: state.page == .agents, action: { actions.page(.agents) }),
         Item(page: .camera, symbol: "web.camera", title: "Camera", selected: state.page == .camera, action: { actions.page(.camera) }),
         Item(page: .files, symbol: "tray.full", title: "Files", selected: state.page == .files, action: { actions.page(.files) })]
    }

    var body: some View {
        let size = CGSize(width: geometry.openWidth, height: geometry.openHeight(state.page, hub))
        let island = geometry.body(size)
        let p = state.buttons
        let span = CGFloat(2) * Metrics.rowSpacingButtons
        let top = max(island.minY + Metrics.diameter / 2 + Metrics.gap, min(island.minY + geometry.header / 2, island.midY - span / 2))
        ZStack(alignment: .topLeading) {
            // The drops, black like the island, under the circles.
            ForEach(0..<3, id: \.self) { i in
                Drop(progress: p, index: i, edge: island.minX, top: top, right: false).fill(.black)
                Drop(progress: p, index: i, edge: island.maxX, top: top, right: true).fill(.black)
            }
            .allowsHitTesting(false)
            ForEach(Array(left.enumerated()), id: \.offset) { i, item in
                circle(item).scaleEffect(0.4 + 0.6 * p).opacity(Double(p)).position(Self.center(i, p, edge: island.minX, top: top, right: false))
            }
            ForEach(Array(right.enumerated()), id: \.offset) { i, item in
                circle(item).scaleEffect(0.4 + 0.6 * p).opacity(Double(p)).position(Self.center(i, p, edge: island.maxX, top: top, right: true))
            }
        }
        .frame(width: geometry.panel.width, height: geometry.panel.height, alignment: .topLeading)
        .allowsHitTesting(p > 0.9)
        .accessibilityHidden(p < 0.9)
    }

    static func center(_ index: Int, _ progress: CGFloat, edge: CGFloat, top: CGFloat, right: Bool) -> CGPoint {
        let phase = min(1.1, max(0, progress))
        let offset = -14 + phase * (14 + Metrics.gap + Metrics.diameter / 2)
        return CGPoint(x: edge + (right ? offset : -offset), y: top + CGFloat(index) * Metrics.rowSpacingButtons)
    }

    private func circle(_ item: Item) -> some View {
        Button(action: item.action) {
            Group {
                if item.page == .ox { OxMark(height: 13, color: .white) }
                else { Image(systemName: item.symbol).font(.system(size: 17, weight: .medium)) }
            }
            .frame(width: Metrics.diameter, height: Metrics.diameter)
            .background(Color.black, in: Circle())
            .overlay { Circle().strokeBorder(.white.opacity(item.selected ? 0.6 : 0.16), lineWidth: 0.75).allowsHitTesting(false) }
            .contentShape(Circle())
        }
        .buttonStyle(NotchButtonStyle(cornerRadius: Metrics.diameter / 2))
        .help(item.title)
        .accessibilityLabel(item.title)
        .accessibilityAddTraits(item.selected ? .isSelected : [])
    }
}

/// Vorssaint's NotchQuickAccessDrop: the circle and, early in its way out, a narrow neck back to the island.
struct Drop: Shape {
    var progress: CGFloat
    let index: Int
    var edge: CGFloat
    var top: CGFloat
    let right: Bool
    var animatableData: CGFloat {
        get { progress }
        set { progress = newValue }
    }
    func path(in rect: CGRect) -> Path {
        let phase = min(1.1, max(0, progress))
        guard phase > 0.001 else { return Path() }
        // Drawn for the left side, then mirrored for the right.
        let anchor = right ? rect.width - edge : edge
        let center = QuickAccess.center(index, phase, edge: anchor, top: top, right: false)
        let radius = Metrics.diameter / 2 * (0.4 + 0.6 * phase)
        var path = Path(ellipseIn: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2))
        let neck = radius * max(0, 1 - phase / 0.84)
        if neck > 0, center.x + radius < anchor {
            path.move(to: CGPoint(x: anchor + 2, y: center.y + neck))
            path.addCurve(to: CGPoint(x: center.x + radius * 0.55, y: center.y + neck * 0.75),
                          control1: CGPoint(x: anchor - 7, y: center.y + neck), control2: CGPoint(x: center.x + radius, y: center.y + neck * 0.15))
            path.addLine(to: CGPoint(x: center.x + radius * 0.55, y: center.y - neck * 0.75))
            path.addCurve(to: CGPoint(x: anchor + 2, y: center.y - neck),
                          control1: CGPoint(x: center.x + radius, y: center.y - neck * 0.15), control2: CGPoint(x: anchor - 7, y: center.y - neck))
            path.closeSubpath()
        }
        return right ? path.applying(CGAffineTransform(a: -1, b: 0, c: 0, d: 1, tx: rect.width, ty: 0)) : path
    }
}
