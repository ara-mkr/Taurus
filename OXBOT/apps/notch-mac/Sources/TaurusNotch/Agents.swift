// SPDX-License-Identifier: GPL-3.0-or-later
// Ported from Vorssaint's Services/AgentUsage (ClaudeReader.swift, CodexReader.swift, AgentLogParser.swift;
// Copyright (C) 2026 Vorssaint), trimmed for Taurus: which projects have a turn open now, tokens today and Codex's
// plan windows. No prices, no history archive, no account servers. See NOTICE.
//
// Read-only: the session logs Claude Code and Codex already write on this Mac. Nothing is copied, kept or sent.

import Foundation
import SQLite3

final class AgentScanner {
    private weak var hub: Hub?
    private let queue = DispatchQueue(label: "local.taurus.notch.agents", qos: .utility)
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
        var requests: [String: Int] = [:]   // day -> requests (Copilot)
        var finalResponse = false
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
        // Copilot CLI and the GitHub Copilot app share one event log per session (Vorssaint's AgentUsageStore).
        let copilot = URL(fileURLWithPath: env["COPILOT_HOME"] ?? home.appendingPathComponent(".copilot").path).appendingPathComponent("session-state")
        for dir in (try? FileManager.default.contentsOfDirectory(at: copilot, includingPropertiesForKeys: nil)) ?? [] {
            let events = dir.appendingPathComponent("events.jsonl")
            if let date = (try? events.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate, date > since {
                found.append((events, .copilot))
            }
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
            switch state.provider {
            case .claude: claude(line, state, now)
            case .codex: codex(line, state, now)
            case .copilot: copilot(line, state, now)
            case .opencode: break   // a database, read in `openCode`
            }
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

    /// Copilot (Vorssaint's CopilotReader): a prompt or turn start opens a turn; a turn end that delivered a final
    /// response (no tool requests, not thinking) closes it, as do abort and shutdown. Each response is a request;
    /// tokens come from the per-model totals written at shutdown. Prompts and replies are never read.
    private func copilot(_ line: Data, _ s: LogState, _ now: Date) {
        guard let json = Self.object(line), let type = json["type"] as? String, let data = json["data"] as? [String: Any] else { return }
        let root = ((json["agentId"] as? String) ?? "").isEmpty
        guard root || type == "assistant.message" else { return }
        let date = Self.date(json["timestamp"]) ?? now
        s.last = max(s.last ?? date, date)
        func project(_ d: [String: Any]?) {
            if let path = ["gitRoot", "cwd", "repository"].compactMap({ d?[$0] as? String }).first(where: { !$0.isEmpty }) { s.project = Self.project(path) }
        }
        switch type {
        case "session.start": project(data["context"] as? [String: Any])
        case "session.context_changed": project(data)
        case "user.message", "assistant.turn_start":
            s.finalResponse = false
            if !s.turnOpen { s.turnOpen = true; s.turnStart = date }
        case "assistant.message":
            let request = (data["apiCallId"] as? String) ?? (data["messageId"] as? String) ?? (json["id"] as? String) ?? "\(date.timeIntervalSince1970)"
            if s.seen.insert("request:\((json["agentId"] as? String) ?? ""):\(request)").inserted { s.requests[Self.dayKey(date), default: 0] += 1 }
            guard root else { return }
            let tools = (data["toolRequests"] as? [Any])?.isEmpty == false
            s.finalResponse = !tools && !["thinking", "commentary"].contains(data["phase"] as? String ?? "")
        case "assistant.turn_end":
            if s.turnOpen, s.finalResponse { s.turnOpen = false; s.finalResponse = false }
        case "abort": s.turnOpen = false
        case "session.shutdown":
            s.turnOpen = false
            for case let metric as [String: Any] in ((data["modelMetrics"] as? [String: Any]) ?? [:]).values {
                let u = metric["usage"] as? [String: Any] ?? [:]
                func count(_ a: String, _ b: String) -> Int { Self.int(u[a] ?? u[b]) }
                s.tokens[Self.dayKey(date), default: 0] += count("input", "inputTokens") + count("output", "outputTokens")
                    + count("cache_read", "cacheReadTokens") + count("cache_write", "cacheWriteTokens")
            }
        default: return
        }
    }

    /// OpenCode (Vorssaint's AgentOpenCodeReader, simplified): its SQLite database, opened read-only. The newer
    /// schema marks a busy session with `time_busy` after `time_idle`; the older one leaves a reply without
    /// `time.completed` while it runs. Tokens are each reply's input, output and cache traffic.
    private func openCode(_ u: inout AgentUsage, now: Date) {
        let env = ProcessInfo.processInfo.environment
        let dataHome = env["XDG_DATA_HOME"].map { URL(fileURLWithPath: $0) } ?? home.appendingPathComponent(".local/share")
        let path = dataHome.appendingPathComponent("opencode/opencode.db").path
        guard FileManager.default.fileExists(atPath: path) else { return }
        var db: OpaquePointer?
        guard sqlite3_open_v2(path, &db, SQLITE_OPEN_READONLY | SQLITE_OPEN_NOMUTEX, nil) == SQLITE_OK else { sqlite3_close(db); return }
        defer { sqlite3_close(db) }
        sqlite3_busy_timeout(db, 200)
        func rows(_ sql: String, _ bind: [Int64], _ each: (OpaquePointer) -> Void) {
            var stmt: OpaquePointer?
            guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else { sqlite3_finalize(stmt); return }
            defer { sqlite3_finalize(stmt) }
            for (i, value) in bind.enumerated() { sqlite3_bind_int64(stmt, Int32(i + 1), value) }
            while sqlite3_step(stmt) == SQLITE_ROW { each(stmt) }
        }
        func has(_ table: String) -> Bool {
            var found = false
            rows("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1".replacingOccurrences(of: "?1", with: "'\(table)'"), []) { _ in found = true }
            return found
        }
        func text(_ stmt: OpaquePointer, _ i: Int32) -> String { sqlite3_column_text(stmt, i).map { String(cString: $0) } ?? "" }
        let ms = { (d: Date) in Int64(d.timeIntervalSince1970 * 1000) }
        let dayStart = ms(Calendar.current.startOfDay(for: now)), fresh = ms(now.addingTimeInterval(-Self.stale))
        let tokens = "COALESCE(json_extract(data,'$.tokens.input'),0) + COALESCE(json_extract(data,'$.tokens.output'),0) + COALESCE(json_extract(data,'$.tokens.cache.read'),0) + COALESCE(json_extract(data,'$.tokens.cache.write'),0)"
        var last: Int64 = 0
        if has("session_v2") && has("session_message") {
            rows("SELECT COALESCE(SUM(\(tokens)),0) FROM session_message WHERE type = 'assistant' AND time_created >= ?", [dayStart]) { u.tokensToday += Int(sqlite3_column_int64($0, 0)) }
            rows("SELECT directory, time_busy FROM session_v2 WHERE time_busy IS NOT NULL AND (time_idle IS NULL OR time_busy > time_idle) AND time_updated >= ? AND parent_id IS NULL", [fresh]) {
                u.working.append(Working(project: Self.project(text($0, 0)), since: Date(timeIntervalSince1970: Double(sqlite3_column_int64($0, 1)) / 1000)))
            }
            rows("SELECT MAX(time_updated) FROM session_v2", []) { last = max(last, sqlite3_column_int64($0, 0)) }
        }
        if has("message") && has("session") {
            rows("SELECT COALESCE(SUM(\(tokens)),0) FROM message WHERE json_extract(data,'$.role') = 'assistant' AND time_created >= ?", [dayStart]) { u.tokensToday += Int(sqlite3_column_int64($0, 0)) }
            rows("""
                SELECT s.directory, MIN(m.time_created) FROM message m JOIN session s ON s.id = m.session_id
                WHERE json_extract(m.data,'$.role') = 'assistant' AND json_extract(m.data,'$.time.completed') IS NULL
                  AND m.time_updated >= ? AND s.parent_id IS NULL GROUP BY s.id
                """, [fresh]) {
                u.working.append(Working(project: Self.project(text($0, 0)), since: Date(timeIntervalSince1970: Double(sqlite3_column_int64($0, 1)) / 1000)))
            }
            rows("SELECT MAX(time_updated) FROM session", []) { last = max(last, sqlite3_column_int64($0, 0)) }
        }
        if last > 0 { u.lastActive = Date(timeIntervalSince1970: Double(last) / 1000) }
        u.working.sort { $0.since < $1.since }
    }

    // MARK: Publish

    private func publish(now: Date) {
        let today = Self.dayKey(now)
        let usage = Provider.allCases.map { provider -> AgentUsage in
            var u = AgentUsage(provider: provider)
            if provider == .opencode { openCode(&u, now: now); return u }
            let logs = files.values.filter { $0.provider == provider }
            u.tokensToday = logs.reduce(0) { $0 + ($1.tokens[today] ?? 0) }
            u.requestsToday = logs.reduce(0) { $0 + ($1.requests[today] ?? 0) }
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
        DispatchQueue.main.async { [weak hub] in hub?.update(agents: usage) }
    }
}
