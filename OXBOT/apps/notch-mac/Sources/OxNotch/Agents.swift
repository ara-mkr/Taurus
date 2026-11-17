// SPDX-License-Identifier: GPL-3.0-or-later
// Ported from Vorssaint's Services/AgentUsage (ClaudeReader.swift, CodexReader.swift, AgentLogParser.swift;
// Copyright (C) 2026 Vorssaint), trimmed for OXBOT: which projects have a turn open now, tokens today and Codex's
// plan windows. No prices, no history archive, no account servers. See NOTICE.
//
// Read-only: the session logs Claude Code and Codex already write on this Mac. Nothing is copied, kept or sent.

import Foundation

final class AgentScanner {
    private weak var hub: Hub?
    private let queue = DispatchQueue(label: "local.oxbot.notch.agents", qos: .utility)
    private var timer: DispatchSourceTimer?
    private var files: [String: LogState] = [:]
    private let home = URL(fileURLWithPath: NSHomeDirectory())
    /// A turn whose log has said nothing for this long is treated as abandoned (a session killed mid-turn).
    private static let stale: TimeInterval = 10 * 60
    /// The first look at a long log starts this far from its end.
    private static let firstRead: UInt64 = 8 * 1_024 * 1_024

    private final class LogState {
        let provider: Provider
        var offset: UInt64 = 0
        var partial = Data()
        var turnOpen = false
        var turnStart: Date?
        var last: Date?
        var project = ""
        var seen = Set<String>()
        var tokens: [String: Int] = [:]   // day -> tokens
        var limits: [LimitWindow] = []
        var limitsAt: Date?
        var plan: String?
        var sawRecords = false
        var lastTotal = 0
        init(_ provider: Provider) { self.provider = provider }
    }

    init(hub: Hub) { self.hub = hub }

    func start() {
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now(), repeating: 5)
        timer.setEventHandler { [weak self] in self?.scan() }
        timer.resume()
        self.timer = timer
    }
    func stop() { timer?.cancel() }

    // MARK: Files

    private func recent(in dir: URL, since: Date) -> [URL] {
        let keys: [URLResourceKey] = [.contentModificationDateKey, .isRegularFileKey]
        guard let names = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: keys) else { return [] }
        return names.filter {
            guard $0.pathExtension == "jsonl", let v = try? $0.resourceValues(forKeys: Set(keys)), v.isRegularFile == true else { return false }
            return (v.contentModificationDate ?? .distantPast) > since
        }
    }

    private func logs(since: Date) -> [(URL, Provider)] {
        let env = ProcessInfo.processInfo.environment
        let claude = URL(fileURLWithPath: env["CLAUDE_CONFIG_DIR"] ?? home.appendingPathComponent(".claude").path).appendingPathComponent("projects")
        var found: [(URL, Provider)] = []
        let projectDirs = (try? FileManager.default.contentsOfDirectory(at: claude, includingPropertiesForKeys: [.contentModificationDateKey])) ?? []
        for dir in projectDirs where ((try? dir.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate ?? .distantPast) > since {
            found += recent(in: dir, since: since).map { ($0, .claude) }
        }
        // Codex files a session under the day it started: today's and yesterday's folders cover a day of use.
        let codex = URL(fileURLWithPath: env["CODEX_HOME"] ?? home.appendingPathComponent(".codex").path).appendingPathComponent("sessions")
        let cal = Calendar.current
        for back in 0...1 {
            guard let day = cal.date(byAdding: .day, value: -back, to: Date()) else { continue }
            let c = cal.dateComponents([.year, .month, .day], from: day)
            let dir = codex.appendingPathComponent(String(format: "%04d/%02d/%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0))
            found += recent(in: dir, since: since).map { ($0, .codex) }
        }
        return found
    }

    private func scan() {
        let now = Date()
        let since = now.addingTimeInterval(-36 * 3600)
        let current = logs(since: since)
        let paths = Set(current.map { $0.0.path })
        files = files.filter { paths.contains($0.key) }
        for (url, provider) in current {
            let state = files[url.path] ?? LogState(provider)
            files[url.path] = state
            read(url, into: state, now: now)
        }
        publish(now: now)
    }

    private func read(_ url: URL, into state: LogState, now: Date) {
        guard let handle = try? FileHandle(forReadingFrom: url) else { return }
        defer { try? handle.close() }
        guard let size = try? handle.seekToEnd() else { return }
        if size < state.offset { state.offset = 0; state.partial = Data() }   // rewritten
        if state.offset == 0, size > Self.firstRead { state.offset = size - Self.firstRead; state.partial = Data(); state.seen = ["skip-first-line"] }
        guard size > state.offset else { return }
        try? handle.seek(toOffset: state.offset)
        guard var data = try? handle.read(upToCount: Int(size - state.offset)) else { return }
        state.offset = size
        if !state.partial.isEmpty { data = state.partial + data; state.partial = Data() }
        var start = data.startIndex
        while let end = data[start...].firstIndex(of: 0x0A) {
            let line = data[start..<end]
            start = data.index(after: end)
            // A read that began mid-file starts mid-line.
            if state.seen.remove("skip-first-line") != nil { continue }
            if state.provider == .claude { claude(line, state, now) } else { codex(line, state, now) }
        }
        state.partial = Data(data[start...])
    }

    // MARK: Readers

    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static func date(_ value: Any?) -> Date? {
        guard let s = value as? String else { return nil }
        return iso.date(from: s) ?? ISO8601DateFormatter().date(from: s)
    }
    private static func int(_ value: Any?) -> Int { (value as? NSNumber)?.intValue ?? 0 }
    private static func dayKey(_ date: Date) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return "\(c.year ?? 0)-\(c.month ?? 0)-\(c.day ?? 0)"
    }
    private static func contains(_ line: Data, _ text: String) -> Bool { line.range(of: Data(text.utf8)) != nil }
    private static func object(_ line: Data) -> [String: Any]? { try? JSONSerialization.jsonObject(with: line) as? [String: Any] }
    /// A worktree counts as the project it belongs to, as Vorssaint's `projectName` does.
    private static func project(_ path: String) -> String {
        var p = path
        if let r = p.range(of: "/.claude/worktrees/") { p = String(p[..<r.lowerBound]) }
        return (p as NSString).lastPathComponent
    }

    /// Claude Code: a person's prompt opens a turn, a reply with a final stop reason closes it, and an interruption
    /// closes it unfinished. Usage is counted once per message and request (a reply is logged once per block).
    private func claude(_ line: Data, _ s: LogState, _ now: Date) {
        if Self.contains(line, #""type":"assistant""#) {
            guard let json = Self.object(line), json["type"] as? String == "assistant", let message = json["message"] as? [String: Any] else { return }
            let date = Self.date(json["timestamp"]) ?? now
            s.last = max(s.last ?? date, date)
            if let cwd = json["cwd"] as? String, !cwd.isEmpty { s.project = Self.project(cwd) }
            let model = message["model"] as? String ?? ""
            if let usage = message["usage"] as? [String: Any], !model.isEmpty, !model.hasPrefix("<") {
                let key = "\(message["id"] as? String ?? ""):\(json["requestId"] as? String ?? "\(date.timeIntervalSince1970)")"
                if s.seen.insert(key).inserted {
                    let total = Self.int(usage["input_tokens"]) + Self.int(usage["cache_creation_input_tokens"])
                        + Self.int(usage["cache_read_input_tokens"]) + Self.int(usage["output_tokens"])
                    s.tokens[Self.dayKey(date), default: 0] += total
                }
            }
            guard json["isSidechain"] as? Bool != true else { return }
            switch message["stop_reason"] as? String {
            case "end_turn", "stop_sequence", "max_tokens", "refusal": s.turnOpen = false
            default:
                if model == "<synthetic>" { return }
                if !s.turnOpen { s.turnOpen = true; s.turnStart = date }
            }
            return
        }
        guard Self.contains(line, #""type":"user""#), !Self.contains(line, #""isSidechain":true"#),
              let json = Self.object(line), json["type"] as? String == "user", json["isMeta"] as? Bool != true else { return }
        let date = Self.date(json["timestamp"]) ?? now
        s.last = max(s.last ?? date, date)
        if let cwd = json["cwd"] as? String, !cwd.isEmpty { s.project = Self.project(cwd) }
        let content = (json["message"] as? [String: Any])?["content"]
        let blocks = content as? [[String: Any]] ?? []
        let texts = (content as? String).map { [$0] } ?? blocks.compactMap { $0["type"] as? String == "text" ? $0["text"] as? String : nil }
        if texts.contains(where: { $0.hasPrefix("[Request interrupted by user") || $0.contains("<local-command-std") }) { s.turnOpen = false; return }
        // Tool results arrive inside a turn; local commands like /clear ask the model nothing.
        if s.turnOpen || texts.contains(where: { $0.hasPrefix("<command-") }) { return }
        if blocks.contains(where: { $0["type"] as? String == "tool_result" }) && texts.isEmpty { return }
        if !texts.isEmpty { s.turnOpen = true; s.turnStart = date }
    }

    /// Codex: task events open and close turns, usage records (or growing running totals in older logs) are usage,
    /// and token counts carry the plan's limit windows.
    private func codex(_ line: Data, _ s: LogState, _ now: Date) {
        let wanted = [#""type":"session_meta""#, #""type":"turn_context""#, #""type":"token_usage_record""#, #""type":"event_msg""#]
        guard wanted.contains(where: { Self.contains(line, $0) }), let json = Self.object(line),
              let payload = json["payload"] as? [String: Any] else { return }
        let date = Self.date(json["timestamp"]) ?? now
        s.last = max(s.last ?? date, date)
        switch json["type"] as? String {
        case "session_meta", "turn_context":
            if let cwd = payload["cwd"] as? String, !cwd.isEmpty { s.project = Self.project(cwd) }
        case "token_usage_record":
            guard let usage = payload["usage"] as? [String: Any] else { return }
            s.sawRecords = true
            let key = payload["response_id"] as? String ?? "\(date.timeIntervalSince1970)"
            if s.seen.insert(key).inserted {
                s.tokens[Self.dayKey(date), default: 0] += Self.int(usage["input_tokens"]) + Self.int(usage["output_tokens"])
            }
        case "event_msg":
            switch payload["type"] as? String {
            case "task_started":
                s.turnOpen = true
                s.turnStart = (payload["started_at"] as? NSNumber).map { Date(timeIntervalSince1970: $0.doubleValue) } ?? date
            case "task_complete", "turn_aborted":
                s.turnOpen = false
            case "token_count":
                if let limits = payload["rate_limits"] as? [String: Any], ((limits["limit_id"] as? String) ?? "codex").lowercased() == "codex" {
                    let windows = ["primary", "secondary"].compactMap { slot -> LimitWindow? in
                        guard let w = limits[slot] as? [String: Any], let used = (w["used_percent"] as? NSNumber)?.doubleValue, used.isFinite else { return nil }
                        return LimitWindow(minutes: (w["window_minutes"] as? NSNumber)?.intValue, usedPercent: min(100, max(0, used)),
                                           resetsAt: (w["resets_at"] as? NSNumber).map { Date(timeIntervalSince1970: $0.doubleValue) })
                    }
                    if !windows.isEmpty, date >= (s.limitsAt ?? .distantPast) {
                        s.limits = windows.sorted { ($0.minutes ?? .max) < ($1.minutes ?? .max) }
                        s.limitsAt = date
                        if let plan = limits["plan_type"] as? String, !plan.isEmpty { s.plan = plan }
                    }
                }
                // Older logs have no usage records: a response is whatever the running total grew by.
                if !s.sawRecords, let total = ((payload["info"] as? [String: Any])?["total_token_usage"] as? [String: Any]) {
                    let sum = Self.int(total["input_tokens"]) + Self.int(total["output_tokens"])
                    if sum > s.lastTotal { s.tokens[Self.dayKey(date), default: 0] += sum - s.lastTotal; s.lastTotal = sum }
                }
            default: return
            }
        default: return
        }
    }

    // MARK: Publish

    private func publish(now: Date) {
        let today = Self.dayKey(now)
        let usage = Provider.allCases.map { provider -> AgentUsage in
            let logs = files.values.filter { $0.provider == provider }
            var u = AgentUsage(provider: provider)
            u.tokensToday = logs.reduce(0) { $0 + ($1.tokens[today] ?? 0) }
            u.lastActive = logs.compactMap(\.last).max()
            u.working = logs.filter { $0.turnOpen && now.timeIntervalSince($0.last ?? .distantPast) < Self.stale }
                .map { Working(project: $0.project.isEmpty ? provider.name : $0.project, since: $0.turnStart ?? $0.last ?? now) }
                .sorted { $0.since < $1.since }
            let freshest = logs.filter { !$0.limits.isEmpty }.max { ($0.limitsAt ?? .distantPast) < ($1.limitsAt ?? .distantPast) }
            // A window that has already reset says nothing about now.
            u.limits = freshest?.limits.filter { ($0.resetsAt ?? .distantFuture) > now } ?? []
            u.plan = freshest?.plan
            return u
        }
        DispatchQueue.main.async { [weak hub] in if hub?.agents != usage { hub?.agents = usage } }
    }
}
