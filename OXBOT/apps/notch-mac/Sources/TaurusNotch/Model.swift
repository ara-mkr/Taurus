// SPDX-License-Identifier: GPL-3.0-or-later
// Taurus's notch: options, settings and the state every island draws from. See NOTICE.

import AppKit
import Combine

// MARK: - Options

/// How TaurusNotch was started. Run by Taurus's desktop app it is `--managed`: settings arrive on stdin and its requests
/// (open the dashboard, save settings) go out on stdout. Run by hand it reads and writes ~/.taurus/desktop.json itself.
struct Options {
    var server = URL(string: "http://127.0.0.1:\(ProcessInfo.processInfo.environment["TAURUS_PORT"] ?? "8787")")!
    var managed = false
    var settings: [String: Any]?
    /// Treat the main display as one with a camera housing. For screenshots when the MacBook's lid is closed.
    var simulateNotch = ProcessInfo.processInfo.environment["OX_NOTCH_SIMULATE"] == "1"
    /// Open every island on this page at start, then behave normally. For screenshots.
    var openPage: Page?
    var home = URL(fileURLWithPath: ProcessInfo.processInfo.environment["TAURUS_HOME"]
                   ?? (NSHomeDirectory() as NSString).appendingPathComponent(".taurus"))

    static func parse(_ arguments: [String]) -> Options {
        var o = Options()
        var rest = arguments.dropFirst().makeIterator()
        while let flag = rest.next() {
            switch flag {
            case "--managed": o.managed = true
            case "--simulate-notch": o.simulateNotch = true
            case "--server":
                // Loopback only: the notch talks to Taurus on this Mac and nowhere else.
                if let value = rest.next(), let url = URL(string: value), let host = url.host,
                   ["127.0.0.1", "localhost", "::1"].contains(host) { o.server = url }
            case "--settings":
                if let value = rest.next(), let json = try? JSONSerialization.jsonObject(with: Data(value.utf8)) as? [String: Any] {
                    o.settings = json
                }
            case "--open": o.openPage = rest.next().flatMap(Page.init(rawValue:))
            default: break
            }
        }
        return o
    }
}

// MARK: - Settings

/// The same settings as the Electron notch (apps/desktop/src/notch-settings.ts, `cleanNotch`), checked field by
/// field the same way, so ~/.taurus/desktop.json works for both. Delays are milliseconds on disk.
struct NotchSettings: Equatable {
    enum Display: String, CaseIterable { case automatic, builtin, main, all }
    var on = true
    var display = Display.automatic
    var openOnHover = true
    var hoverDelay = 150
    var closeDelay = 450
    var mascotLeft = true
    var idleOx = true
    var showAnswer = true, showMusic = true, showTimers = true, showAsk = true
    var overFullScreen = true
    var inCaptures = true
    var pillWithoutNotch = true
    var dropFromTop = 0
    /// Vorssaint's own notch settings, kept under "native" in desktop.json so the Electron notch keeps them as they are.
    var native = Native()

    /// Ported from Vorssaint's Settings > Notch and Settings > Agents (NotchSettings.swift, NotchAgentsSettings.swift),
    /// with its ranges (NotchSupport.swift: NotchSize, NotchCameraFit, NotchCapsuleFit).
    struct Native: Equatable {
        enum Size: String, CaseIterable { case compact, spacious, custom }
        enum Shape: String, CaseIterable { case capsule, notch }
        enum LimitDisplay: String, CaseIterable { case remaining, used }
        enum LimitFocus: String, CaseIterable { case mostUsed, session, weekly }
        enum Readout: String, CaseIterable { case elapsed, tokens, limit }
        /// Vorssaint's "At rest": what the closed island's wings show while nothing else does.
        enum Resting: String, CaseIterable { case none, music, battery, agents }
        static let widthRange = 360.0...600.0, heightRange = 260.0...640.0
        static let cameraWidthRange = -10.0...10.0, cameraHeightRange = -6.0...6.0
        static let capsuleWidthRange = -40.0...40.0, capsuleHeightRange = -4.0...4.0, capsuleDropRange = 0.0...20.0

        var size = Size.spacious
        var customWidth = 440.0, customHeight = 480.0
        /// Vorssaint's "translucent background": dark glass instead of solid black once the island opens.
        var glass = false
        /// How the island meets a display without a camera: a capsule in the menu bar, or a cutout from the top edge.
        var shape = Shape.capsule
        var capsuleWidth = 0.0, capsuleHeight = 0.0, capsuleDrop = 0.0
        var cameraWidth = 0.0, cameraHeight = 0.0
        var outline = false
        var agents: Set<Provider> = Set(Provider.allCases)
        var limitDisplay = LimitDisplay.remaining
        var limitFocus = LimitFocus.mostUsed
        /// Show a working agent in the closed island.
        var live = true
        var readout = Readout.elapsed
        var finishAlert = true
        /// Minutes a turn must have run for its end to be announced; 0 is any length.
        var finishMinimum = 1
        var limitAlert = true
        var limitThreshold = 90
        var resting = Resting.none

        init() {}
        init(json r: [String: Any]?) {
            guard let r else { return }
            func clamp(_ key: String, _ range: ClosedRange<Double>, _ fallback: Double) -> Double {
                guard let n = r[key] as? NSNumber, !(r[key] is Bool), n.doubleValue.isFinite else { return fallback }
                return min(range.upperBound, max(range.lowerBound, n.doubleValue))
            }
            func bool(_ key: String, _ fallback: Bool) -> Bool { r[key] as? Bool ?? fallback }
            size = (r["size"] as? String).flatMap(Size.init(rawValue:)) ?? size
            customWidth = (clamp("customWidth", Self.widthRange, customWidth) / 10).rounded() * 10
            customHeight = (clamp("customHeight", Self.heightRange, customHeight) / 10).rounded() * 10
            glass = bool("glass", glass)
            shape = (r["shape"] as? String).flatMap(Shape.init(rawValue:)) ?? shape
            capsuleWidth = clamp("capsuleWidth", Self.capsuleWidthRange, 0).rounded()
            capsuleHeight = clamp("capsuleHeight", Self.capsuleHeightRange, 0).rounded()
            capsuleDrop = clamp("capsuleDrop", Self.capsuleDropRange, 0).rounded()
            cameraWidth = clamp("cameraWidth", Self.cameraWidthRange, 0).rounded()
            cameraHeight = (clamp("cameraHeight", Self.cameraHeightRange, 0) * 2).rounded() / 2
            outline = bool("outline", outline)
            if let list = r["agents"] as? [String] { agents = Set(list.compactMap(Provider.init(rawValue:))) }
            limitDisplay = (r["limitDisplay"] as? String).flatMap(LimitDisplay.init(rawValue:)) ?? limitDisplay
            limitFocus = (r["limitFocus"] as? String).flatMap(LimitFocus.init(rawValue:)) ?? limitFocus
            live = bool("live", live)
            readout = (r["readout"] as? String).flatMap(Readout.init(rawValue:)) ?? readout
            finishAlert = bool("finishAlert", finishAlert)
            finishMinimum = Int(clamp("finishMinimum", 0...60, Double(finishMinimum)).rounded())
            limitAlert = bool("limitAlert", limitAlert)
            limitThreshold = Int(clamp("limitThreshold", 50...99, Double(limitThreshold)).rounded())
            resting = (r["resting"] as? String).flatMap(Resting.init(rawValue:)) ?? resting
        }
        var json: [String: Any] {
            ["size": size.rawValue, "customWidth": customWidth, "customHeight": customHeight, "glass": glass,
             "shape": shape.rawValue, "capsuleWidth": capsuleWidth, "capsuleHeight": capsuleHeight, "capsuleDrop": capsuleDrop,
             "cameraWidth": cameraWidth, "cameraHeight": cameraHeight, "outline": outline,
             "agents": Provider.allCases.filter(agents.contains).map(\.rawValue), "limitDisplay": limitDisplay.rawValue,
             "limitFocus": limitFocus.rawValue, "live": live, "readout": readout.rawValue, "finishAlert": finishAlert,
             "finishMinimum": finishMinimum, "limitAlert": limitAlert, "limitThreshold": limitThreshold, "resting": resting.rawValue]
        }
    }

    init() {}
    init(json raw: [String: Any]?, base: NotchSettings = NotchSettings()) {
        self = base
        guard let r = raw else { return }
        func bool(_ key: String, _ fallback: Bool) -> Bool { r[key] as? Bool ?? fallback }
        func num(_ key: String, _ lo: Int, _ hi: Int, _ fallback: Int) -> Int {
            guard let n = r[key] as? NSNumber, n.doubleValue.isFinite, !(r[key] is Bool) else { return fallback }
            return Int(max(Double(lo), min(Double(hi), n.doubleValue)).rounded())
        }
        on = bool("on", on)
        if let d = (r["display"] as? String).flatMap(Display.init(rawValue:)) { display = d }
        if let o = r["open"] as? String, ["hover", "click"].contains(o) { openOnHover = o == "hover" }
        hoverDelay = num("hoverDelay", 0, 1000, hoverDelay)
        closeDelay = num("closeDelay", 0, 2000, closeDelay)
        if let s = r["mascotSide"] as? String, ["left", "right"].contains(s) { mascotLeft = s == "left" }
        if let i = r["idle"] as? String, ["taurus", "nothing"].contains(i) { idleOx = i == "taurus" }
        let show = r["show"] as? [String: Any] ?? [:]
        showAnswer = show["answer"] as? Bool ?? showAnswer
        showMusic = show["music"] as? Bool ?? showMusic
        showTimers = show["timers"] as? Bool ?? showTimers
        showAsk = show["ask"] as? Bool ?? showAsk
        overFullScreen = bool("overFullScreen", overFullScreen)
        inCaptures = bool("inCaptures", inCaptures)
        if let n = r["noNotch"] as? String, ["pill", "hidden"].contains(n) { pillWithoutNotch = n == "pill" }
        dropFromTop = num("dropFromTop", 0, 24, dropFromTop)
        if let n = r["native"] as? [String: Any] { native = Native(json: n) }
    }

    /// Only the fields the native notch's own settings page changes, in the Electron shape.
    var editable: [String: Any] {
        ["display": display.rawValue, "open": openOnHover ? "hover" : "click", "idle": idleOx ? "taurus" : "nothing",
         "noNotch": pillWithoutNotch ? "pill" : "hidden", "overFullScreen": overFullScreen, "inCaptures": inCaptures,
         "hoverDelay": hoverDelay, "closeDelay": closeDelay, "mascotSide": mascotLeft ? "left" : "right",
         "show": ["answer": showAnswer, "music": showMusic, "timers": showTimers, "ask": showAsk], "native": native.json]
    }
}

/// ~/.taurus/desktop.json, shared with Taurus's desktop app. Written only when TaurusNotch runs on its own.
enum DesktopFile {
    static func url(_ home: URL) -> URL { home.appendingPathComponent("desktop.json") }
    static func load(_ home: URL) -> [String: Any]? {
        guard let data = try? Data(contentsOf: url(home)),
              let all = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return all["notch"] as? [String: Any]
    }
    static func save(_ partial: [String: Any], home: URL) {
        var all = (try? Data(contentsOf: url(home))).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? [:]
        var notch = all["notch"] as? [String: Any] ?? [:]
        notch.merge(partial) { _, new in new }
        all["notch"] = notch
        guard let data = try? JSONSerialization.data(withJSONObject: all, options: [.prettyPrinted, .sortedKeys]) else { return }
        try? FileManager.default.createDirectory(at: home, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        try? data.write(to: url(home), options: .atomic)
        try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url(home).path)
    }
}

// MARK: - What the islands show

/// The island's pages: Vorssaint's sections that fit Taurus, and "all", its sections grid.
enum Page: String, CaseIterable {
    case taurus, music, agents, ask, camera, files, timers, notes, system, all
    var title: String {
        switch self {
        case .taurus: return "Taurus"
        case .music: return "Music"
        case .agents: return "Agents"
        case .ask: return "Ask"
        case .camera: return "Camera"
        case .files: return "Files"
        case .timers: return "Timers"
        case .notes: return "Notes"
        case .system: return "System"
        case .all: return "All"
        }
    }
}

struct Voice: Equatable {
    enum Phase: String { case listening, thinking, answer, error, idle }
    var phase: Phase
    var said: String?
    var text: String?
    var at: Date
}

struct Activity: Identifiable, Equatable {
    let id: Int
    var text: String
    var state: String   // running, done, failed, note
    var at: Date
}

struct TaurusTimer: Identifiable, Equatable {
    let id: String
    var label: String
    var endsAt: Date
}

struct Ring: Equatable {
    let id: String
    var title: String
}

/// What's playing: the system's Now Playing (any app) first, else the Spotify window Taurus's server opened.
struct Track: Equatable {
    var title: String
    var artist: String
    var app: String
    var playing: Bool
    var duration: Double?
    var elapsed: Double?
    var sampledAt: Date
    var rate: Double
    var artwork: NSImage?
    /// System Now Playing can take commands directly; Taurus's Spotify goes through the server.
    var fromSystem: Bool

    func position(at date: Date) -> Double? {
        guard let elapsed else { return nil }
        let moved = elapsed + (playing ? max(0, date.timeIntervalSince(sampledAt)) * max(rate, 0) : 0)
        return duration.map { min($0, moved) } ?? moved
    }
}

/// The coding agents whose session logs the notch reads, as in Vorssaint's AgentProvider.
enum Provider: String, CaseIterable, Identifiable {
    case claude, codex, opencode, copilot
    var id: String { rawValue }
    var name: String {
        switch self {
        case .claude: return "Claude Code"
        case .codex: return "Codex"
        case .opencode: return "OpenCode"
        case .copilot: return "GitHub Copilot"
        }
    }
    /// Copilot's local log has no plan allowance in it.
    var reportsLimits: Bool { self != .copilot }
}

struct LimitWindow: Equatable {
    var minutes: Int?
    var usedPercent: Double
    var resetsAt: Date?
    var name: String {
        guard let minutes else { return "Plan" }
        if minutes == 300 { return "5-hour window" }
        if (6 * 1440...8 * 1440).contains(minutes) { return "Week" }
        return minutes % 60 == 0 ? "\(minutes / 60)-hour window" : "\(minutes)-minute window"
    }
}

struct Working: Equatable {
    var project: String
    var since: Date
}

struct AgentUsage: Equatable {
    var provider: Provider
    var tokensToday = 0
    /// Copilot counts requests rather than tokens.
    var requestsToday = 0
    /// Projects with a turn open right now, and since when.
    var working: [Working] = []
    var lastActive: Date?
    var limits: [LimitWindow] = []
    var plan: String?
}

/// Calls Taurus itself sent through a plan app today (apps/server/src/subscriptions.ts `usage()`).
struct PlanUsage: Equatable {
    var name: String
    var callsToday: Int
}

/// Everything the islands draw from, on the main thread.
final class Hub: ObservableObject {
    @Published var settings: NotchSettings
    @Published var connected = false
    @Published var voice: Voice?
    @Published var activity: [Activity] = []
    @Published var timers: [TaurusTimer] = []
    @Published var ring: Ring?
    @Published var systemTrack: Track?
    @Published var serverTrack: Track?
    @Published var agents: [AgentUsage] = Provider.allCases.map { AgentUsage(provider: $0) }
    @Published var plans: [PlanUsage] = []
    /// Bumped when Taurus finishes an answer, so he charges once.
    @Published var charges = 0
    /// A short notice in the closed island, as Vorssaint's agent alerts: an agent finished, or a plan is nearly used.
    @Published var notice: Notice?
    private var alerted = Set<String>()
    /// Files dropped on the notch (Vorssaint's shelf): references only, in memory, until removed or TaurusNotch quits.
    @Published var shelf: [URL] = []
    /// The scratchpad, saved owner-only in ~/.taurus/notch-notes.txt.
    @Published var notes = ""

    struct Notice: Equatable {
        var provider: Provider
        var text: String
        var at: Date
    }

    init(settings: NotchSettings) { self.settings = settings }

    /// The agents the owner tracks, in Vorssaint's order.
    var trackedAgents: [AgentUsage] { agents.filter { settings.native.agents.contains($0.provider) } }

    /// New readings from the session logs. A turn that was open and isn't now has finished; a plan window past the
    /// alert threshold is announced once per window.
    func update(agents next: [AgentUsage]) {
        let n = settings.native
        if n.finishAlert {
            for old in agents where n.agents.contains(old.provider) {
                let still = next.first { $0.provider == old.provider }?.working ?? []
                for w in old.working where !still.contains(w) && Date().timeIntervalSince(w.since) >= Double(n.finishMinimum * 60) {
                    show(Notice(provider: old.provider, text: "Done in \(w.project)", at: Date()))
                }
            }
        }
        if n.limitAlert {
            for a in next where n.agents.contains(a.provider) {
                for w in a.limits where w.usedPercent >= Double(n.limitThreshold) {
                    let key = "\(a.provider.rawValue):\(w.name):\(w.resetsAt?.timeIntervalSince1970 ?? 0)"
                    if alerted.insert(key).inserted { show(Notice(provider: a.provider, text: "\(w.name) \(Int(w.usedPercent))% used", at: Date())) }
                }
            }
        }
        if agents != next { agents = next }
    }

    private func show(_ n: Notice) {
        notice = n
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in if self?.notice == n { self?.notice = nil } }
    }

    var track: Track? {
        guard settings.showMusic else { return nil }
        if let s = systemTrack, s.playing || serverTrack?.playing != true { return s }
        return serverTrack ?? systemTrack
    }
    var running: [Activity] { activity.filter { $0.state == "running" } }
    var workingAgents: [(provider: Provider, work: Working)] {
        trackedAgents.flatMap { a in a.working.map { (a.provider, $0) } }.sorted { $0.work.since < $1.work.since }
    }
    /// The spoken answer stays up for a while after it arrives.
    var recentVoice: Voice? {
        guard let v = voice else { return nil }
        if v.phase == .answer || v.phase == .error { return Date().timeIntervalSince(v.at) < 15 * 60 ? v : nil }
        return v.phase == .idle ? nil : v
    }
}
