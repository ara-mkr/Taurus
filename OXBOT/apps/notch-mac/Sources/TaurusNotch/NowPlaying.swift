// SPDX-License-Identifier: GPL-3.0-or-later
// Ported from Vorssaint's NotchMusicService.swift and Resources/now-playing.pl (Copyright (C) 2026 Vorssaint),
// trimmed for Taurus: one watcher, play/pause/next/previous, artwork. See NOTICE.
//
// Runs /usr/bin/perl with a small script that loads libOxNowPlaying.dylib (Sources/TaurusNowPlaying) and follows the
// system's Now Playing: whatever app is playing (Spotify, Music, a browser tab). Commands go back on perl's stdin.

import AppKit

final class NowPlaying {
    private weak var hub: Hub?
    private var process: Process?
    private var input: FileHandle?
    private var restarts = 0
    private var stopping = false
    private var lastArtwork: NSImage?

    /// The script Vorssaint ships as Resources/now-playing.pl, with Taurus's entry point.
    private static let script = """
    use strict; use warnings; use DynaLoader; $| = 1;
    my ($library) = @ARGV;
    die "usage: now-playing <library>\\n" unless defined $library && -f $library;
    my $handle = DynaLoader::dl_load_file($library, 0) or die "cannot load: " . DynaLoader::dl_error() . "\\n";
    my $symbol = DynaLoader::dl_find_symbol($handle, "taurus_now_playing_watch") or die "entry point missing\\n";
    DynaLoader::dl_install_xsub("main::taurus_now_playing_run", $symbol);
    taurus_now_playing_run();
    """

    /// Built beside TaurusNotch by `swift build`, and copied beside it by the desktop app's bundle step.
    static var library: URL? {
        let dir = URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath().deletingLastPathComponent()
        let url = dir.appendingPathComponent("libOxNowPlaying.dylib")
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    init(hub: Hub) { self.hub = hub }

    func start() {
        guard process == nil, !stopping, let library = Self.library else { return }
        let process = Process()
        let output = Pipe(), input = Pipe()
        // A child can exit between a check and a write: make that an error, never a SIGPIPE that ends the notch.
        _ = fcntl(input.fileHandleForWriting.fileDescriptor, F_SETNOSIGPIPE, 1)
        process.executableURL = URL(fileURLWithPath: "/usr/bin/perl")
        process.arguments = ["-e", Self.script, library.path]
        process.standardOutput = output
        process.standardInput = input
        process.standardError = FileHandle.nullDevice
        var buffer = Data()
        output.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            if data.isEmpty { handle.readabilityHandler = nil; return }
            buffer.append(data)
            while let end = buffer.firstIndex(of: 0x0A) {
                let line = buffer[buffer.startIndex..<end]
                buffer.removeSubrange(buffer.startIndex...end)
                guard let json = try? JSONSerialization.jsonObject(with: line) as? [String: Any] else { continue }
                // Decode the cover off the main thread; it can be a few megabytes.
                let image = (json["artwork"] as? String).flatMap { Data(base64Encoded: $0) }.flatMap(NSImage.init(data:))
                DispatchQueue.main.async { self?.receive(json, image: image) }
            }
        }
        process.terminationHandler = { [weak self] _ in
            DispatchQueue.main.async {
                guard let self, !self.stopping else { return }
                self.process = nil
                self.input = nil
                // Back off and give up after a few tries; the server's Spotify window still shows music.
                self.restarts += 1
                if self.restarts <= 5 { DispatchQueue.main.asyncAfter(deadline: .now() + Double(self.restarts) * 2) { self.start() } }
            }
        }
        do {
            try process.run()
            self.process = process
            self.input = input.fileHandleForWriting
        } catch { output.fileHandleForReading.readabilityHandler = nil }
    }

    func stop() {
        stopping = true
        try? input?.close()
        process?.terminate()
        process = nil
    }

    func send(_ command: String) {
        guard ["toggle", "next", "previous"].contains(command) else { return }
        try? input?.write(contentsOf: Data((command + "\n").utf8))
    }

    private func receive(_ json: [String: Any], image: NSImage?) {
        guard let hub else { return }
        if json["sent"] != nil || json["error"] != nil { return }
        restarts = 0
        guard let title = json["title"] as? String, !title.isEmpty else { hub.systemTrack = nil; lastArtwork = nil; return }
        if let image { lastArtwork = image } else if json["artworkSame"] as? Bool != true { lastArtwork = nil }
        let bundle = json["app"] as? String
        let app = bundle.flatMap { NSWorkspace.shared.urlForApplication(withBundleIdentifier: $0) }
            .map { FileManager.default.displayName(atPath: $0.path).replacingOccurrences(of: ".app", with: "") } ?? bundle ?? ""
        let rate = (json["rate"] as? NSNumber)?.doubleValue ?? 0
        let playing = json["isPlaying"] as? Bool ?? (rate > 0)
        let sampled = (json["timestamp"] as? NSNumber).map { Date(timeIntervalSince1970: $0.doubleValue) } ?? Date()
        hub.systemTrack = Track(title: title, artist: json["artist"] as? String ?? "", app: app, playing: playing,
                                duration: (json["duration"] as? NSNumber)?.doubleValue,
                                elapsed: (json["elapsed"] as? NSNumber)?.doubleValue,
                                sampledAt: sampled, rate: playing ? max(rate, 1) : 0, artwork: lastArtwork, fromSystem: true)
    }
}
