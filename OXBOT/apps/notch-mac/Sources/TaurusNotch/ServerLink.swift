// SPDX-License-Identifier: GPL-3.0-or-later
// Taurus's notch: what Taurus is doing, from Taurus's own server on this Mac. See NOTICE.
//
// Reads the same local streams the Electron notch and the dashboard use (apps/server/src/ring.ts and activity.ts):
// Taurus's voice phases, his windows (music, timers), rings and his activity log. Writes only what the notch's buttons
// say, with the `x-taurus` header every Taurus write needs: a question for Taurus, a Spotify control for Taurus's own
// player, cancelling a timer and answering a ring. Loopback only (Options.parse refuses any other host).

import AppKit

final class ServerLink {
    private let base: URL
    private weak var hub: Hub?
    private let session: URLSession
    private var tasks: [Task<Void, Never>] = []
    private var planTimer: Timer?
    /// A few turns, so "and tomorrow?" follows on from the last question asked in the notch.
    private var turns: [[String: String]] = []

    init(base: URL, hub: Hub) {
        self.base = base
        self.hub = hub
        let config = URLSessionConfiguration.ephemeral
        // The server sends a heartbeat every 25 seconds on both streams.
        config.timeoutIntervalForRequest = 60
        config.timeoutIntervalForResource = 7 * 24 * 3600
        config.connectionProxyDictionary = [:]
        session = URLSession(configuration: config)
    }

    func start() {
        tasks.append(follow("/api/ring/stream", connected: { [weak self] on in self?.hub?.connected = on }) { [weak self] event, data in
            self?.ringEvent(event, data)
        })
        tasks.append(follow("/api/activity/stream", connected: { _ in }) { [weak self] event, data in
            self?.activityEvent(event, data)
        })
        plans()
        planTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in self?.plans() }
    }

    func stop() { tasks.forEach { $0.cancel() }; planTimer?.invalidate() }

    // MARK: Streams

    /// Server-sent events, one `data:` line per event, reconnecting every two seconds while Taurus is away.
    private func follow(_ path: String, connected: @escaping (Bool) -> Void,
                        handle: @escaping (String, Any) -> Void) -> Task<Void, Never> {
        let url = base.appendingPathComponent(path)
        let session = session
        return Task.detached {
            while !Task.isCancelled {
                do {
                    var request = URLRequest(url: url)
                    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                    let (bytes, response) = try await session.bytes(for: request)
                    guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
                    await MainActor.run { connected(true) }
                    var event = "message"
                    for try await line in bytes.lines {
                        if line.hasPrefix("event: ") { event = String(line.dropFirst(7)); continue }
                        guard line.hasPrefix("data: "),
                              let json = try? JSONSerialization.jsonObject(with: Data(line.dropFirst(6).utf8)) else { continue }
                        let name = event
                        event = "message"
                        await MainActor.run { handle(name, json) }
                    }
                } catch {}
                await MainActor.run { connected(false) }
                try? await Task.sleep(nanoseconds: 2_000_000_000)
            }
        }
    }

    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    static func date(_ value: Any?) -> Date? {
        guard let s = value as? String else { return nil }
        return iso.date(from: s) ?? ISO8601DateFormatter().date(from: s)
    }

    /// The same rules as the Electron notch's `event()` (apps/desktop/src/notch.ts).
    private func ringEvent(_ name: String, _ json: Any) {
        guard let hub, let d = json as? [String: Any] else { return }
        switch name {
        case "voice":
            guard let phase = (d["phase"] as? String).flatMap(Voice.Phase.init(rawValue:)) else { return }
            // The microphone closing after an answer leaves the answer up.
            if phase == .idle, let v = hub.voice, v.phase != .listening { return }
            hub.voice = Voice(phase: phase, said: d["said"] as? String, text: d["text"] as? String, at: Self.date(d["at"]) ?? Date())
            if phase == .answer { hub.charges += 1 }
        case "window":
            switch d["kind"] as? String {
            case "music":
                let m = d["music"] as? [String: Any]
                guard let t = m?["track"] as? [String: Any], let title = t["title"] as? String else { hub.serverTrack = nil; return }
                let duration = (t["durationMs"] as? NSNumber).map { $0.doubleValue / 1000 }
                var track = Track(title: title, artist: t["artist"] as? String ?? "", app: "Spotify through Taurus",
                                  playing: m?["playing"] as? Bool ?? false, duration: duration,
                                  elapsed: (m?["progressMs"] as? NSNumber).map { $0.doubleValue / 1000 },
                                  sampledAt: Self.date(m?["at"]) ?? Date(), rate: 1, artwork: nil, fromSystem: false)
                // Spotify's cover art, from Spotify's own image server only.
                if let art = t["art"] as? String, let url = URL(string: art), url.scheme == "https", url.host?.hasSuffix("scdn.co") == true {
                    Task { [weak self] in
                        guard let (data, _) = try? await URLSession.shared.data(from: url), let image = NSImage(data: data) else { return }
                        await MainActor.run { [weak self] in
                            if let hub = self?.hub, hub.serverTrack?.title == title { hub.serverTrack?.artwork = image }
                        }
                    }
                    track.artwork = hub.serverTrack?.title == title ? hub.serverTrack?.artwork : nil
                }
                hub.serverTrack = track
            case "timer":
                guard let id = d["id"] as? String else { return }
                hub.timers.removeAll { $0.id == id }
                if d["done"] as? Bool != true, let t = d["timer"] as? [String: Any], let ends = Self.date(t["endsAt"]) {
                    hub.timers.append(TaurusTimer(id: id, label: t["label"] as? String ?? "Timer", endsAt: ends))
                    hub.timers.sort { $0.endsAt < $1.endsAt }
                }
            case "mac", "open", "note":
                // What an instant command did ("Opening Notes."), when it didn't come with a spoken answer of its own.
                if let v = hub.voice, Date().timeIntervalSince(v.at) < 3 { return }
                let text = d["kind"] as? String == "open" ? "Opening \(d["name"] as? String ?? "it")." : (d["text"] as? String ?? d["title"] as? String ?? "")
                guard !text.isEmpty else { return }
                hub.voice = Voice(phase: .answer, said: d["said"] as? String, text: text, at: Date())
            default: return
            }
        case "window-closed":
            guard let id = d["id"] as? String else { return }
            if id == "music" { hub.serverTrack = nil } else { hub.timers.removeAll { $0.id == id } }
        case "ring":
            guard let id = d["id"] as? String else { return }
            let state = d["state"] as? String
            if state == "ringing" || state == "escalated" { hub.ring = Ring(id: id, title: d["title"] as? String ?? "Taurus needs you") }
            else if hub.ring?.id == id { hub.ring = nil }
        default: return
        }
    }

    private func activityEvent(_ name: String, _ json: Any) {
        guard let hub else { return }
        func entry(_ any: Any) -> Activity? {
            guard let d = any as? [String: Any], let id = (d["id"] as? NSNumber)?.intValue, let text = d["text"] as? String else { return nil }
            return Activity(id: id, text: text, state: d["state"] as? String ?? "note", at: Self.date(d["at"]) ?? Date())
        }
        if name == "hello", let list = json as? [Any] {
            hub.activity = Array(list.compactMap(entry).suffix(30))
        } else if let a = entry(json) {
            if let i = hub.activity.firstIndex(where: { $0.id == a.id }) { hub.activity[i] = a } else { hub.activity.append(a) }
            if hub.activity.count > 30 { hub.activity.removeFirst(hub.activity.count - 30) }
        }
    }

    private func plans() {
        Task { [weak self] in
            guard let self, let (data, _) = try? await self.session.data(from: self.base.appendingPathComponent("/api/ai")),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let usage = json["usage"] as? [[String: Any]] else { return }
            let plans = usage.compactMap { u -> PlanUsage? in
                guard let name = u["name"] as? String, let calls = ((u["today"] as? [String: Any])?["calls"] as? NSNumber)?.intValue, calls > 0 else { return nil }
                return PlanUsage(name: name, callsToday: calls)
            }
            await MainActor.run { self.hub?.plans = plans }
        }
    }

    // MARK: Writes

    @discardableResult
    private func post(_ path: String, _ body: [String: Any] = [:], timeout: TimeInterval = 15) async -> (Int, [String: Any]) {
        var request = URLRequest(url: base.appendingPathComponent(path), timeoutInterval: timeout)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("1", forHTTPHeaderField: "x-taurus")
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        guard let (data, response) = try? await session.data(for: request) else { return (0, [:]) }
        return ((response as? HTTPURLResponse)?.statusCode ?? 0,
                (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:])
    }

    /// Asked in the notch counts as spoken, like the Electron notch: every notch shows Taurus thinking, then his answer.
    /// Files from the shelf go with the question the way Ask's attachments do (apps/server/src/index.ts `/api/ask`):
    /// a text file's words as `files`, one PNG, JPEG or WebP picture as `image`. Only files the owner gave Taurus are read.
    func ask(_ text: String, attachments: [URL] = []) async -> Result<String, AskError> {
        let question = String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(500))
        guard !question.isEmpty else { return .failure(AskError("Ask something.")) }
        var files: [[String: String]] = [], image: String?
        for url in attachments {
            let kind = ["png": "png", "jpg": "jpeg", "jpeg": "jpeg", "webp": "webp"][url.pathExtension.lowercased()]
            guard let data = try? Data(contentsOf: url) else { return .failure(AskError("Couldn’t read \(url.lastPathComponent).")) }
            if let kind, image == nil, data.count <= 4_000_000 {
                image = "data:image/\(kind);base64,\(data.base64EncodedString())"
            } else if data.count <= 400_000, let words = String(data: data, encoding: .utf8) {
                files.append(["name": url.lastPathComponent, "text": words])
            } else {
                return .failure(AskError("Taurus reads text files under 400 KB and one PNG, JPEG or WebP picture under 4 MB."))
            }
        }
        let next = turns + [["role": "user", "text": question]]
        var request: [String: Any] = ["turns": next, "via": "talk"]
        if !files.isEmpty { request["files"] = files }
        if let image { request["image"] = image }
        let (status, body) = await post("/api/ask", request, timeout: 90)
        guard status == 200, let answer = body["text"] as? String else {
            return .failure(AskError(body["error"] as? String ?? (status == 0 ? "Taurus isn’t answering. Is it still running?" : "Taurus said \(status).")))
        }
        turns = Array((next + [["role": "assistant", "text": answer]]).suffix(6))
        return .success(answer)
    }

    /// Taurus's own Spotify player: "pause", "resume", "next", "previous".
    func music(_ control: String) { Task { await post("/api/music", ["do": control]) } }
    func cancelTimer(_ id: String) { Task { await post("/api/timers/cancel", ["id": id]) } }
    /// The words you would say; Taurus's instant commands start it without the AI.
    func startTimer(_ minutes: Int) {
        let m = max(1, min(600, minutes))
        Task { await post("/api/ask", ["turns": [["role": "user", "text": "set a timer for \(m) minute\(m == 1 ? "" : "s")"]], "via": "ask"]) }
    }
    func answerRing(_ id: String) {
        guard id.range(of: "^[a-f0-9-]+$", options: .regularExpression) != nil else { return }
        Task { await post("/api/ring/\(id)/ack") }
    }
}

struct AskError: Error { let message: String; init(_ m: String) { message = m } }
