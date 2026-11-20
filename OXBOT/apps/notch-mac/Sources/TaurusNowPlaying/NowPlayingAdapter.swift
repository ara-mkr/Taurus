// SPDX-License-Identifier: GPL-3.0-or-later
// Ported from Vorssaint's Sources/NowPlayingAdapter/NowPlayingAdapter.swift (Copyright (C) 2026 Vorssaint),
// trimmed for Taurus: one watch entry point, no source picking, no queue, no seeking. See NOTICE.
//
// Since macOS 15.4 MediaRemote answers nothing unless the calling process carries Apple's own signature, so the notch
// cannot read what's playing itself. /usr/bin/perl is a platform binary and can: TaurusNotch runs perl with a tiny
// script that loads this library and calls `taurus_now_playing_watch`, which prints one JSON line each time the system's
// Now Playing changes and reads "toggle", "next" and "previous" from stdin. Nothing else is read or sent anywhere.

import AppKit
import Foundation

private typealias InfoCallback = @convention(block) (NSDictionary?) -> Void
private typealias InfoFunction = @convention(c) (DispatchQueue, @escaping InfoCallback) -> Void
private typealias IsPlayingCallback = @convention(block) (Bool) -> Void
private typealias IsPlayingFunction = @convention(c) (DispatchQueue, @escaping IsPlayingCallback) -> Void
private typealias DisplayIDCallback = @convention(block) (NSString?) -> Void
private typealias DisplayIDFunction = @convention(c) (DispatchQueue, @escaping DisplayIDCallback) -> Void
private typealias SendCommandFunction = @convention(c) (Int32, CFDictionary?) -> Bool
private typealias RegisterFunction = @convention(c) (DispatchQueue) -> Void

private let mediaRemote = dlopen("/System/Library/PrivateFrameworks/MediaRemote.framework/MediaRemote", RTLD_LAZY)

private func function<T>(_ name: String, as type: T.Type) -> T? {
    guard let mediaRemote, let symbol = dlsym(mediaRemote, name) else { return nil }
    return unsafeBitCast(symbol, to: type)
}

/// Covers past this are left out rather than pushed through the pipe.
private let maximumArtworkBytes = 3 * 1_024 * 1_024
/// Reads run one at a time on `reader`, so this needs no lock.
private var previousArtwork: Data?
private let emissionLock = NSLock()

/// JSONSerialization raises an Objective-C exception on NaN or infinity, which a live stream can report.
private func emit(_ reply: [String: Any]) {
    let finite = reply.filter { ($0.value as? Double)?.isFinite != false }
    let data = (try? JSONSerialization.data(withJSONObject: finite)) ?? Data("{\"error\":\"json\"}".utf8)
    emissionLock.lock()
    defer { emissionLock.unlock() }
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
}

private func read() {
    guard let getInfo = function("MRMediaRemoteGetNowPlayingInfo", as: InfoFunction.self) else {
        emit(["error": "MRMediaRemoteGetNowPlayingInfo unavailable"]); return
    }
    let queue = DispatchQueue(label: "local.taurus.now-playing.callbacks")
    let group = DispatchGroup()
    let lock = NSLock()
    var reply: [String: Any] = [:]
    func set(_ key: String, _ value: Any?) {
        guard let value else { return }
        lock.lock(); reply[key] = value; lock.unlock()
    }
    group.enter()
    getInfo(queue) { info in
        let info = (info as? [String: Any]) ?? [:]
        set("title", info["kMRMediaRemoteNowPlayingInfoTitle"] as? String)
        set("artist", info["kMRMediaRemoteNowPlayingInfoArtist"] as? String)
        set("album", info["kMRMediaRemoteNowPlayingInfoAlbum"] as? String)
        set("duration", (info["kMRMediaRemoteNowPlayingInfoDuration"] as? NSNumber)?.doubleValue)
        set("elapsed", (info["kMRMediaRemoteNowPlayingInfoElapsedTime"] as? NSNumber)?.doubleValue)
        set("timestamp", (info["kMRMediaRemoteNowPlayingInfoTimestamp"] as? Date)?.timeIntervalSince1970)
        set("rate", (info["kMRMediaRemoteNowPlayingInfoPlaybackRate"] as? NSNumber)?.doubleValue)
        let artwork = info["kMRMediaRemoteNowPlayingInfoArtworkData"] as? Data
        if let artwork, artwork == previousArtwork {
            set("artworkSame", true)
        } else if let artwork, !artwork.isEmpty, artwork.count <= maximumArtworkBytes {
            set("artwork", artwork.base64EncodedString())
        }
        previousArtwork = artwork
        group.leave()
    }
    if let isPlaying = function("MRMediaRemoteGetNowPlayingApplicationIsPlaying", as: IsPlayingFunction.self) {
        group.enter()
        isPlaying(queue) { playing in set("isPlaying", playing); group.leave() }
    }
    if let displayID = function("MRMediaRemoteGetNowPlayingApplicationDisplayID", as: DisplayIDFunction.self) {
        group.enter()
        displayID(queue) { id in set("app", id as String?); group.leave() }
    }
    // A missing callback must not leave stale playback up forever.
    guard group.wait(timeout: .now() + 2) == .success else { emit(["error": "timeout"]); return }
    lock.lock(); let snapshot = reply; lock.unlock()
    emit(snapshot)
}

/// Play/pause, next and previous, as MediaRemote numbers them.
private let commands: [String: Int32] = ["toggle": 2, "next": 4, "previous": 5]

@_cdecl("taurus_now_playing_watch")
public func taurusNowPlayingWatch() {
    guard let register = function("MRMediaRemoteRegisterForNowPlayingNotifications", as: RegisterFunction.self) else {
        emit(["error": "notifications unavailable"]); return
    }
    register(.main)
    let reader = DispatchQueue(label: "local.taurus.now-playing.reader")
    var pending: DispatchWorkItem?
    func refresh() {
        pending?.cancel()
        let work = DispatchWorkItem { read() }
        pending = work
        reader.asyncAfter(deadline: .now() + 0.12, execute: work)
    }
    let names = ["kMRMediaRemoteNowPlayingInfoDidChangeNotification",
                 "kMRMediaRemoteNowPlayingApplicationDidChangeNotification",
                 "kMRMediaRemoteNowPlayingApplicationIsPlayingDidChangeNotification",
                 "kMRMediaRemotePlayerIsPlayingDidChangeNotification"]
    let observers = names.map {
        NotificationCenter.default.addObserver(forName: Notification.Name($0), object: nil, queue: .main) { _ in refresh() }
    }
    let quit = NSWorkspace.shared.notificationCenter.addObserver(
        forName: NSWorkspace.didTerminateApplicationNotification, object: nil, queue: .main) { _ in refresh() }
    let send = function("MRMediaRemoteSendCommand", as: SendCommandFunction.self)
    var buffered = ""
    FileHandle.standardInput.readabilityHandler = { input in
        let data = input.availableData
        // TaurusNotch closed the pipe: it quit, so this does too.
        if data.isEmpty { exit(0) }
        buffered += String(decoding: data, as: UTF8.self)
        while let end = buffered.firstIndex(of: "\n") {
            let word = buffered[..<end].trimmingCharacters(in: .whitespaces)
            buffered = String(buffered[buffered.index(after: end)...])
            guard let command = commands[word], let send else { emit(["sent": false]); continue }
            // `refresh` belongs to the main queue, like the notifications that call it.
            reader.async { emit(["sent": send(command, nil)]); DispatchQueue.main.async { refresh() } }
        }
    }
    // Some players change their position without a notification; read again now and then while one is open.
    let tick = Timer(timeInterval: 15, repeats: true) { _ in refresh() }
    RunLoop.main.add(tick, forMode: .common)
    reader.async { read() }
    withExtendedLifetime((observers, quit, tick)) { RunLoop.main.run() }
}
