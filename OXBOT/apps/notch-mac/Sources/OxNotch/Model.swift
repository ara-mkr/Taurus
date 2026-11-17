// SPDX-License-Identifier: GPL-3.0-or-later
// OXBOT's notch: options, settings and the state every island draws from. See NOTICE.

import AppKit
import Combine

// MARK: - Options

/// How OxNotch was started. Run by OXBOT's desktop app it is `--managed`: settings arrive on stdin and its requests
/// (open the dashboard, save settings) go out on stdout. Run by hand it reads and writes ~/.oxbot/desktop.json itself.
struct Options {
    var server = URL(string: "http://127.0.0.1:\(ProcessInfo.processInfo.environment["OXBOT_PORT"] ?? "8787")")!
    var managed = false
    var settings: [String: Any]?
    /// Treat the main display as one with a camera housing. For screenshots when the MacBook's lid is closed.
    var simulateNotch = ProcessInfo.processInfo.environment["OX_NOTCH_SIMULATE"] == "1"
    /// Open every island on this page at start, then behave normally. For screenshots.
    var openPage: Page?
    var home = URL(fileURLWithPath: ProcessInfo.processInfo.environment["OXBOT_HOME"]
                   ?? (NSHomeDirectory() as NSString).appendingPathComponent(".oxbot"))

    static func parse(_ arguments: [String]) -> Options {
        var o = Options()
        var rest = arguments.dropFirst().makeIterator()
        while let flag = rest.next() {
            switch flag {
            case "--managed": o.managed = true
            case "--simulate-notch": o.simulateNotch = true
            case "--server":
                // Loopback only: the notch talks to OXBOT on this Mac and nowhere else.
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
/// field the same way, so ~/.oxbot/desktop.json works for both. Delays are milliseconds on disk.
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
        if let i = r["idle"] as? String, ["ox", "nothing"].contains(i) { idleOx = i == "ox" }
        let show = r["show"] as? [String: Any] ?? [:]
        showAnswer = show["answer"] as? Bool ?? showAnswer
        showMusic = show["music"] as? Bool ?? showMusic
        showTimers = show["timers"] as? Bool ?? showTimers
        showAsk = show["ask"] as? Bool ?? showAsk
        overFullScreen = bool("overFullScreen", overFullScreen)
        inCaptures = bool("inCaptures", inCaptures)
        if let n = r["noNotch"] as? String, ["pill", "hidden"].contains(n) { pillWithoutNotch = n == "pill" }
        dropFromTop = num("dropFromTop", 0, 24, dropFromTop)
    }

    /// Only the fields the native notch's own settings page changes, in the Electron shape.
    var editable: [String: Any] {
        ["display": display.rawValue, "open": openOnHover ? "hover" : "click", "idle": idleOx ? "ox" : "nothing",
         "noNotch": pillWithoutNotch ? "pill" : "hidden", "overFullScreen": overFullScreen, "inCaptures": inCaptures]
    }
}

/// ~/.oxbot/desktop.json, shared with OXBOT's desktop app. Written only when OxNotch runs on its own.
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

enum Page: String, CaseIterable { case ox, music, agents, ask, settings }

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

struct OxTimer: Identifiable, Equatable {
    let id: String
    var label: String
    var endsAt: Date
}

struct Ring: Equatable {
    let id: String
    var title: String
}

/// What's playing: the system's Now Playing (any app) first, else the Spotify window OXBOT's server opened.
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
    /// System Now Playing can take commands directly; OXBOT's Spotify goes through the server.
    var fromSystem: Bool

    func position(at date: Date) -> Double? {
        guard let elapsed else { return nil }
        let moved = elapsed + (playing ? max(0, date.timeIntervalSince(sampledAt)) * max(rate, 0) : 0)
        return duration.map { min($0, moved) } ?? moved
    }
}

enum Provider: String, CaseIterable, Identifiable {
    case claude, codex
    var id: String { rawValue }
    var name: String { self == .claude ? "Claude Code" : "Codex" }
    var short: String { self == .claude ? "Claude" : "Codex" }
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
    /// Projects with a turn open right now, and since when.
    var working: [Working] = []
    var lastActive: Date?
    var limits: [LimitWindow] = []
    var plan: String?
}

/// Calls OXBOT itself sent through a plan app today (apps/server/src/subscriptions.ts `usage()`).
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
    @Published var timers: [OxTimer] = []
    @Published var ring: Ring?
    @Published var systemTrack: Track?
    @Published var serverTrack: Track?
    @Published var agents: [AgentUsage] = Provider.allCases.map { AgentUsage(provider: $0) }
    @Published var plans: [PlanUsage] = []
    /// Bumped when Ox finishes an answer, so he charges once.
    @Published var charges = 0

    init(settings: NotchSettings) { self.settings = settings }

    var track: Track? {
        guard settings.showMusic else { return nil }
        if let s = systemTrack, s.playing || serverTrack?.playing != true { return s }
        return serverTrack ?? systemTrack
    }
    var running: [Activity] { activity.filter { $0.state == "running" } }
    var workingAgents: [(provider: Provider, work: Working)] {
        agents.flatMap { a in a.working.map { (a.provider, $0) } }.sorted { $0.work.since < $1.work.since }
    }
    /// The spoken answer stays up for a while after it arrives.
    var recentVoice: Voice? {
        guard let v = voice else { return nil }
        if v.phase == .answer || v.phase == .error { return Date().timeIntervalSince(v.at) < 15 * 60 ? v : nil }
        return v.phase == .idle ? nil : v
    }
}
