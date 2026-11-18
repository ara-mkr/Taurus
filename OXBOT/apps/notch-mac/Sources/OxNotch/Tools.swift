// SPDX-License-Identifier: GPL-3.0-or-later
// The notch's tools, ported from Vorssaint's sections (NotchCameraView.swift and CameraPreviewService, NotchFilesView,
// NotchTimerView, NotchScratchpadView, NotchSystemView and NotchRestingBattery; Copyright (C) 2026 Vorssaint) in its
// layout and type, trimmed for OXBOT. See NOTICE.

import AppKit
import AVFoundation
import IOKit.ps
import SwiftUI
import UniformTypeIdentifiers

// MARK: - Power (Vorssaint's NotchRestingBattery)

enum Power {
    struct Battery { let percent: Int; let charging: Bool; let plugged: Bool }
    static func battery() -> Battery? {
        guard let info = IOPSCopyPowerSourcesInfo()?.takeRetainedValue(),
              let list = IOPSCopyPowerSourcesList(info)?.takeRetainedValue() as? [CFTypeRef], let first = list.first,
              let d = IOPSGetPowerSourceDescription(info, first)?.takeUnretainedValue() as? [String: Any],
              let percent = d[kIOPSCurrentCapacityKey] as? Int else { return nil }
        return Battery(percent: percent, charging: d[kIOPSIsChargingKey] as? Bool ?? false,
                       plugged: d[kIOPSPowerSourceStateKey] as? String == kIOPSACPowerValue)
    }
    static func symbol(_ b: Battery) -> String {
        if b.charging || b.plugged { return "battery.100percent.bolt" }
        switch b.percent { case ..<13: return "battery.0percent"; case ..<38: return "battery.25percent"
        case ..<63: return "battery.50percent"; case ..<88: return "battery.75percent"; default: return "battery.100percent" }
    }
    static func tint(_ b: Battery) -> Color { !b.plugged && b.percent <= 10 ? .red : .white.opacity(0.9) }
}

// MARK: - Camera

/// A mirror (Vorssaint's camera section): the Mac's camera, only while the Camera page is open. Nothing is recorded,
/// saved or sent anywhere.
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
        c.automaticallyAdjustsVideoMirroring = false
        c.isVideoMirrored = true
    }
}

struct CameraPage: View {
    @ObservedObject private var camera = CameraModel.shared
    var body: some View {
        Group {
            switch camera.state {
            case .running:
                CameraPreview(session: camera.session)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .overlay(alignment: .bottomLeading) {
                        if camera.devices.count > 1 {
                            Menu {
                                ForEach(camera.devices, id: \.uniqueID) { d in Button(d.localizedName) { camera.select(d) } }
                            } label: {
                                Label(camera.devices.first { $0.uniqueID == camera.selected }?.localizedName ?? "Camera", systemImage: "web.camera")
                                    .font(.system(size: 10, weight: .medium))
                            }
                            .menuStyle(.borderlessButton).fixedSize().padding(8)
                        }
                    }
            case .denied:
                VStack(spacing: 10) {
                    EmptyMessage(symbol: "web.camera", message: "Allow the camera in System Settings, Privacy & Security, Camera.")
                    WordButton("Open Privacy & Security") {
                        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera") { NSWorkspace.shared.open(url) }
                    }
                }
            case .missing: EmptyMessage(symbol: "web.camera", message: "No camera connected.")
            case .asking, .off: ProgressView().controlSize(.small).frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear { camera.start() }
        .onDisappear { camera.stop() }
    }
}

// MARK: - Files (Vorssaint's shelf)

/// Files dropped on the island wait here to be dragged out again, opened, shown in Finder or given to Ox. Only
/// references are kept, in memory.
struct FilesPage: View {
    @ObservedObject var hub: Hub
    let actions: Actions

    private func thumbnail(_ url: URL) -> NSImage {
        if ["png", "jpg", "jpeg", "gif", "heic", "webp", "tiff"].contains(url.pathExtension.lowercased()), let image = NSImage(contentsOf: url) { return image }
        return NSWorkspace.shared.icon(forFile: url.path)
    }

    var body: some View {
        if hub.shelf.isEmpty {
            EmptyMessage(symbol: "tray.and.arrow.down", message: "Drop files here to keep them close. Drag them out again whenever you need them.")
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(hub.shelf, id: \.self) { url in
                        VStack(spacing: 5) {
                            Image(nsImage: thumbnail(url)).resizable().aspectRatio(contentMode: .fit).frame(width: 44, height: 44)
                            Text(url.lastPathComponent).font(.system(size: 10, weight: .medium)).lineLimit(2).multilineTextAlignment(.center)
                                .truncationMode(.middle).frame(height: 26)
                        }
                        .padding(8)
                        .frame(width: 92, height: 98)
                        .modifier(CardSurface(cornerRadius: 16))
                        .onDrag { NSItemProvider(contentsOf: url) ?? NSItemProvider() }
                        .contextMenu {
                            Button { actions.askAbout(url) } label: { Label("Ask Ox", systemImage: "bubble.left") }
                            Button { NSWorkspace.shared.open(url) } label: { Label("Open", systemImage: "arrow.up.forward.app") }
                            Button { NSWorkspace.shared.activateFileViewerSelecting([url]) } label: { Label("Show in Finder", systemImage: "folder") }
                            Divider()
                            Button(role: .destructive) { actions.removeFile(url) } label: { Label("Remove", systemImage: "xmark") }
                        }
                        .onTapGesture(count: 2) { NSWorkspace.shared.open(url) }
                        .help("\(url.lastPathComponent): drag it out, double-click to open, or secondary-click for more")
                    }
                }
            }
        }
    }
}

// MARK: - Timers (Vorssaint's timer, on OXBOT's own timers)

struct TimersPage: View {
    @ObservedObject var hub: Hub
    let actions: Actions
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                ForEach([1, 5, 10, 15, 25, 45], id: \.self) { m in
                    Button { actions.startTimer(m) } label: {
                        Text("\(m) min").font(.system(size: 11, weight: .medium)).frame(maxWidth: .infinity).frame(height: 28)
                            .modifier(CardSurface(cornerRadius: 9))
                    }
                    .buttonStyle(NotchButtonStyle(cornerRadius: 9))
                }
            }
            if hub.timers.isEmpty {
                Text("No timers running").font(.system(size: 11)).foregroundStyle(.secondary)
            }
            ForEach(hub.timers) { t in
                HStack(spacing: 8) {
                    Image(systemName: "timer").font(.system(size: 12, weight: .semibold)).foregroundStyle(.orange)
                    Text(t.label).font(.system(size: 12, weight: .medium)).lineLimit(1)
                    Spacer()
                    TimelineView(.periodic(from: .now, by: 1)) { c in
                        Text(clock(t.endsAt.timeIntervalSince(c.date))).font(.system(size: 26, weight: .light)).monospacedDigit()
                    }
                    NotchIconButton(symbol: "xmark", title: "Cancel") { actions.cancelTimer(t.id) }
                }
            }
        }
    }
}

// MARK: - Notes (Vorssaint's scratchpad)

struct NotesPage: View {
    @ObservedObject var hub: Hub
    let actions: Actions
    @FocusState private var focused: Bool
    var body: some View {
        TextEditor(text: $hub.notes)
            .font(.system(size: 13))
            .scrollContentBackground(.hidden)
            .focused($focused)
            .padding(8)
            .modifier(CardSurface(cornerRadius: 16))
            .onAppear { actions.focusKeyboard(); DispatchQueue.main.async { focused = true } }
    }
}

// MARK: - System (Vorssaint's system cards, trimmed)

final class SystemModel: ObservableObject {
    @Published var cpu: Double?
    @Published var memoryUsed: UInt64 = 0
    @Published var battery: Power.Battery?
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
        battery = Power.battery()
        diskFree = (try? URL(fileURLWithPath: "/").resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]))?.volumeAvailableCapacityForImportantUsage
    }
}

struct SystemPage: View {
    @StateObject private var model = SystemModel()
    private func gb(_ bytes: Double) -> String { String(format: "%.1f GB", bytes / 1_073_741_824) }

    private func card(_ title: String, _ symbol: String, _ value: String, _ detail: String, _ share: Double?, tint: Color = .white) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 5) {
                Image(systemName: symbol).font(.system(size: 10, weight: .semibold)).foregroundStyle(.secondary)
                Text(title).font(.system(size: 10.5, weight: .semibold)).foregroundStyle(.white.opacity(0.9))
            }
            Text(value).font(.system(size: 22, weight: .medium, design: .rounded)).monospacedDigit().foregroundStyle(tint)
            if let share {
                GeometryReader { g in
                    ZStack(alignment: .leading) {
                        Capsule().fill(.white.opacity(0.12))
                        Capsule().fill(tint).frame(width: g.size.width * min(1, max(0, share)))
                    }
                }
                .frame(height: 3)
            }
            Text(detail).font(.system(size: 9.5)).foregroundStyle(.secondary).lineLimit(1)
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .modifier(CardSurface())
    }

    var body: some View {
        let total = Double(ProcessInfo.processInfo.physicalMemory)
        HStack(spacing: 8) {
            card("CPU", "cpu", model.cpu.map { "\(Int($0.rounded()))%" } ?? "–", "In use", model.cpu.map { $0 / 100 })
            card("Memory", "memorychip", gb(Double(model.memoryUsed)), "of \(gb(total))", Double(model.memoryUsed) / total)
            if let b = model.battery {
                card("Battery", Power.symbol(b), "\(b.percent)%", b.charging ? "Charging" : b.plugged ? "Charged" : "On battery", Double(b.percent) / 100,
                     tint: b.percent <= 10 && !b.plugged ? .red : .green)
            }
            if let free = model.diskFree { card("Disk", "internaldrive", gb(Double(free)), "Available", nil) }
        }
        .onAppear { model.start() }
        .onDisappear { model.stop() }
    }
}
