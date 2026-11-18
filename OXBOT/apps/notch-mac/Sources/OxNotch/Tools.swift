// SPDX-License-Identifier: GPL-3.0-or-later
// The notch's tools, ported from Vorssaint's sections (NotchModule; NotchCameraView.swift and CameraPreviewService,
// NotchFilesView.swift's shelf, NotchTimerView.swift, NotchScratchpadView.swift, NotchSystemView.swift and
// NotchSectionsView.swift; Copyright (C) 2026 Vorssaint), trimmed and reskinned for OXBOT. See NOTICE.

import AppKit
import AVFoundation
import IOKit.ps
import SwiftUI
import UniformTypeIdentifiers

// MARK: - Camera

/// A mirror (Vorssaint's camera section): the Mac's camera shown in the island, only while the Camera page is open.
/// Nothing is recorded, saved or sent anywhere.
final class CameraModel: ObservableObject {
    static let shared = CameraModel()
    enum State { case off, asking, denied, running, missing }
    @Published private(set) var state = State.off
    @Published private(set) var devices: [AVCaptureDevice] = []
    @Published private(set) var selected: String?
    let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "local.oxbot.notch.camera")

    func start() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: run()
        case .notDetermined:
            state = .asking
            AVCaptureDevice.requestAccess(for: .video) { ok in DispatchQueue.main.async { if ok { self.run() } else { self.state = .denied } } }
        default: state = .denied
        }
    }

    private func run() {
        devices = AVCaptureDevice.DiscoverySession(deviceTypes: [.builtInWideAngleCamera, .external], mediaType: .video, position: .unspecified).devices
        guard let device = devices.first(where: { $0.uniqueID == selected }) ?? devices.first else { state = .missing; return }
        selected = device.uniqueID
        let session = session
        queue.async {
            session.beginConfiguration()
            session.inputs.forEach(session.removeInput)
            if let input = try? AVCaptureDeviceInput(device: device), session.canAddInput(input) { session.addInput(input) }
            if session.canSetSessionPreset(.high) { session.sessionPreset = .high }
            session.commitConfiguration()
            if !session.isRunning { session.startRunning() }
        }
        state = .running
    }

    func stop() {
        let session = session
        queue.async { if session.isRunning { session.stopRunning() } }
        if state == .running || state == .asking { state = .off }
    }

    func select(_ device: AVCaptureDevice) {
        selected = device.uniqueID
        if state == .running { run() }
    }
}

private struct CameraPreview: NSViewRepresentable {
    let session: AVCaptureSession
    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        view.wantsLayer = true
        view.layer = CALayer()
        let preview = AVCaptureVideoPreviewLayer(session: session)
        preview.videoGravity = .resizeAspectFill
        preview.autoresizingMask = [.layerWidthSizable, .layerHeightSizable]
        preview.frame = view.bounds
        view.layer?.addSublayer(preview)
        return view
    }
    func updateNSView(_ view: NSView, context: Context) {
        guard let preview = view.layer?.sublayers?.first as? AVCaptureVideoPreviewLayer, let c = preview.connection, c.isVideoMirroringSupported else { return }
        // A mirror, as Vorssaint's: you see yourself the way a mirror shows you.
        c.automaticallyAdjustsVideoMirroring = false
        c.isVideoMirrored = true
    }
}

struct CameraPage: View {
    @ObservedObject private var camera = CameraModel.shared
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            switch camera.state {
            case .running:
                CameraPreview(session: camera.session)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                HStack {
                    Text("Only on this Mac while you look. Nothing is recorded or sent.").font(.system(size: 13)).foregroundStyle(Ink.tertiary).lineLimit(1)
                    Spacer()
                    if camera.devices.count > 1 {
                        ForEach(camera.devices, id: \.uniqueID) { d in
                            Button(d.localizedName) { camera.select(d) }.buttonStyle(.plain)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(d.uniqueID == camera.selected ? Ink.primary : Ink.secondary)
                        }
                    }
                }
            case .denied:
                Text("OXBOT can’t use the camera. Allow it in System Settings, Privacy & Security, Camera.").font(.system(size: 15)).foregroundStyle(Ink.secondary)
                WordButton("Open Camera settings") {
                    if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera") { NSWorkspace.shared.open(url) }
                }
            case .missing: Text("No camera found.").font(.system(size: 15)).foregroundStyle(Ink.secondary)
            case .asking, .off: Text("Starting the camera.").font(.system(size: 15)).foregroundStyle(Ink.secondary)
            }
        }
        .onAppear { camera.start() }
        .onDisappear { camera.stop() }
    }
}

// MARK: - Files

/// Vorssaint's shelf: files dropped on the notch wait here to be dragged out again, opened, shown in Finder or given
/// to Ox. Only references are kept, in memory.
struct FilesPage: View {
    @ObservedObject var hub: Hub
    let actions: Actions

    private func thumbnail(_ url: URL) -> NSImage {
        if ["png", "jpg", "jpeg", "gif", "heic", "webp", "tiff"].contains(url.pathExtension.lowercased()), let image = NSImage(contentsOf: url) { return image }
        return NSWorkspace.shared.icon(forFile: url.path)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if hub.shelf.isEmpty {
                Text("Drop files on Ox to keep them here, drag them out again, or give one to Ox.").font(.system(size: 15)).foregroundStyle(Ink.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(hub.shelf, id: \.self) { url in
                        HStack(spacing: 10) {
                            Image(nsImage: thumbnail(url)).resizable().aspectRatio(contentMode: .fill).frame(width: 32, height: 32)
                                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                            Text(url.lastPathComponent).font(.system(size: 13, weight: .semibold)).lineLimit(1).truncationMode(.middle)
                            Spacer(minLength: 8)
                            WordButton("Ask Ox") { actions.askAbout(url) }
                            WordButton("Open") { NSWorkspace.shared.open(url) }
                            WordButton("Show") { NSWorkspace.shared.activateFileViewerSelecting([url]) }
                            WordButton("Remove") { actions.removeFile(url) }
                        }
                        // Drag it back out, to Finder or any app.
                        .onDrag { NSItemProvider(contentsOf: url) ?? NSItemProvider() }
                    }
                }
            }
            HStack {
                WordButton("Add files") { actions.addFiles() }
                if !hub.shelf.isEmpty { WordButton("Clear") { hub.shelf.removeAll() } }
            }
        }
    }
}

// MARK: - Timers

/// OXBOT's own timers (apps/server/src/timers.ts), started from the notch with the words you would say.
struct TimersPage: View {
    @ObservedObject var hub: Hub
    let actions: Actions
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text("Start").font(.system(size: 13)).foregroundStyle(Ink.secondary)
                ForEach([1, 5, 10, 15, 25, 45], id: \.self) { m in WordButton("\(m) min") { actions.startTimer(m) } }
            }
            if hub.timers.isEmpty { Text("No timers running.").font(.system(size: 15)).foregroundStyle(Ink.secondary) }
            ForEach(hub.timers) { t in
                HStack {
                    Text(t.label).font(.system(size: 15)).lineLimit(1)
                    Spacer()
                    TimelineView(.periodic(from: .now, by: 1)) { c in
                        Text(clock(t.endsAt.timeIntervalSince(c.date))).font(.system(size: 22, weight: .semibold)).monospacedDigit()
                    }
                    WordButton("Cancel") { actions.cancelTimer(t.id) }
                }
            }
        }
    }
}

// MARK: - Notes

/// Vorssaint's scratchpad: a note that stays, saved owner-only in ~/.oxbot/notch-notes.txt.
struct NotesPage: View {
    @ObservedObject var hub: Hub
    let actions: Actions
    @FocusState private var focused: Bool
    var body: some View {
        TextEditor(text: $hub.notes)
            .font(.system(size: 15))
            .scrollContentBackground(.hidden)
            .focused($focused)
            .padding(8)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.white.opacity(0.06)))
            .onAppear { actions.focusKeyboard(); DispatchQueue.main.async { focused = true } }
    }
}

// MARK: - System

/// Vorssaint's system section, trimmed: processor, memory, battery and disk, read every two seconds while shown.
final class SystemModel: ObservableObject {
    @Published var cpu: Double?
    @Published var memoryUsed: UInt64 = 0
    @Published var battery: (percent: Int, charging: Bool)?
    @Published var diskFree: Int64?
    private var timer: Timer?
    private var lastTicks: (busy: UInt64, total: UInt64)?

    func start() {
        sample()
        timer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in self?.sample() }
    }
    func stop() { timer?.invalidate(); timer = nil }

    private func sample() {
        var load = host_cpu_load_info()
        var count = mach_msg_type_number_t(MemoryLayout<host_cpu_load_info_data_t>.stride / MemoryLayout<integer_t>.stride)
        let ok = withUnsafeMutablePointer(to: &load) { $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { host_statistics(mach_host_self(), HOST_CPU_LOAD_INFO, $0, &count) } }
        if ok == KERN_SUCCESS {
            let t = load.cpu_ticks
            let busy = UInt64(t.0) + UInt64(t.1) + UInt64(t.3), total = busy + UInt64(t.2)
            if let last = lastTicks, total > last.total { cpu = Double(busy - last.busy) / Double(total - last.total) * 100 }
            lastTicks = (busy, total)
        }
        var vm = vm_statistics64()
        var vmCount = mach_msg_type_number_t(MemoryLayout<vm_statistics64_data_t>.stride / MemoryLayout<integer_t>.stride)
        let vmOK = withUnsafeMutablePointer(to: &vm) { $0.withMemoryRebound(to: integer_t.self, capacity: Int(vmCount)) { host_statistics64(mach_host_self(), HOST_VM_INFO64, $0, &vmCount) } }
        if vmOK == KERN_SUCCESS {
            // What Activity Monitor calls Memory Used: app memory, wired and compressed.
            let pages = UInt64(vm.internal_page_count) - UInt64(vm.purgeable_count) + UInt64(vm.wire_count) + UInt64(vm.compressor_page_count)
            memoryUsed = pages * UInt64(getpagesize())
        }
        if let info = IOPSCopyPowerSourcesInfo()?.takeRetainedValue(),
           let list = IOPSCopyPowerSourcesList(info)?.takeRetainedValue() as? [CFTypeRef],
           let first = list.first,
           let d = IOPSGetPowerSourceDescription(info, first)?.takeUnretainedValue() as? [String: Any],
           let percent = d[kIOPSCurrentCapacityKey] as? Int {
            battery = (percent, d[kIOPSIsChargingKey] as? Bool ?? false)
        } else { battery = nil }
        diskFree = (try? URL(fileURLWithPath: "/").resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]))?.volumeAvailableCapacityForImportantUsage
    }
}

struct SystemPage: View {
    @StateObject private var model = SystemModel()
    private func gb(_ bytes: Double) -> String { String(format: "%.1f GB", bytes / 1_073_741_824) }

    private func row(_ name: String, _ value: String, _ share: Double?) -> some View {
        HStack(spacing: 12) {
            Text(name).font(.system(size: 13)).foregroundStyle(Ink.secondary).frame(width: 84, alignment: .leading)
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.white.opacity(0.14))
                    if let share { Capsule().fill(Ink.primary).frame(width: g.size.width * min(1, max(0, share))) }
                }
            }
            .frame(height: 4)
            Text(value).font(.system(size: 13, weight: .semibold)).monospacedDigit().frame(width: 150, alignment: .trailing)
        }
    }

    var body: some View {
        let total = Double(ProcessInfo.processInfo.physicalMemory)
        VStack(alignment: .leading, spacing: 14) {
            row("Processor", model.cpu.map { "\(Int($0.rounded()))% busy" } ?? "Measuring", model.cpu.map { $0 / 100 })
            row("Memory", "\(gb(Double(model.memoryUsed))) of \(gb(total))", Double(model.memoryUsed) / total)
            if let b = model.battery { row("Battery", "\(b.percent)%\(b.charging ? ", charging" : "")", Double(b.percent) / 100) }
            if let free = model.diskFree { row("Disk", "\(gb(Double(free))) free", nil) }
        }
        .onAppear { model.start() }
        .onDisappear { model.stop() }
    }
}

// MARK: - All

/// Vorssaint's sections grid: every page of the island, and the way to OXBOT's settings.
struct AllPage: View {
    let actions: Actions
    private let pages: [Page] = [.ox, .music, .agents, .ask, .camera, .files, .timers, .notes, .system]
    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 5), spacing: 8) {
            ForEach(pages, id: \.self) { p in tile(p.title) { actions.page(p) } }
            tile("Settings") { actions.dashboard("notch") }
        }
    }
    private func tile(_ title: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(.system(size: 15, weight: .semibold)).frame(maxWidth: .infinity, minHeight: 52)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.white.opacity(0.07)))
        }
        .buttonStyle(.plain)
    }
}
