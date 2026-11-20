// SPDX-License-Identifier: GPL-3.0-or-later
// Taurus, drawn from Taurus's own design/logo/taurus-mascot.svg: two triangle eyes under an upturned horn crescent, nothing
// else. This replaces Vorssaint's mascot entirely. His one motion is the charge (docs/11-design-rules.md): lean,
// tuck the horns (each horn turns, no squash; the eyes never change), burst, ease out. Listening, the horns pinch
// gently. Reduce Motion keeps him still.

import SwiftUI

/// The SVG's coordinates (viewBox 455 738 1138 857), y down like SwiftUI's.
private enum TaurusPath {
    static let box = CGRect(x: 455, y: 738, width: 1138, height: 857)
    /// The crescent's centre and radii, with the SVG's 24-unit stroke folded in.
    static let centre = CGPoint(x: 1024, y: 760)
    static let outer: CGFloat = 547 + 12, inner: CGFloat = 425 - 12
    /// Where each horn turns: the bottom of the crescent.
    static let pivot = UnitPoint(x: (1024 - box.minX) / box.width, y: (760 + outer - box.minY) / box.height)

    static func point(_ angle: CGFloat, _ r: CGFloat) -> CGPoint { CGPoint(x: centre.x + r * cos(angle), y: centre.y + r * sin(angle)) }

    /// One horn: half the crescent, from its tip (angle pi on the left, 0 on the right) to the bottom (pi/2).
    static func horn(left: Bool) -> [CGPoint] {
        let tip: CGFloat = left ? .pi : 0, steps = 32
        let out = (0...steps).map { point(tip + (.pi / 2 - tip) * CGFloat($0) / CGFloat(steps), outer) }
        let back = (0...steps).map { point(.pi / 2 + (tip - .pi / 2) * CGFloat($0) / CGFloat(steps), inner) }
        return out + back
    }

    /// An SVG circular arc (rx = ry, no rotation) sampled into points, per SVG 1.1 appendix F.6.5.
    static func arc(from a: CGPoint, to b: CGPoint, r: CGFloat, large: Bool, sweep: Bool) -> [CGPoint] {
        let x1 = (a.x - b.x) / 2, y1 = (a.y - b.y) / 2
        let k = sqrt(max(0, (r * r - x1 * x1 - y1 * y1) / max(x1 * x1 + y1 * y1, .ulpOfOne))) * (large == sweep ? -1 : 1)
        let cx = k * y1 + (a.x + b.x) / 2, cy = -k * x1 + (a.y + b.y) / 2
        let start = atan2(a.y - cy, a.x - cx)
        var delta = atan2(b.y - cy, b.x - cx) - start
        if sweep, delta < 0 { delta += 2 * .pi }
        if !sweep, delta > 0 { delta -= 2 * .pi }
        return (1...16).map { i in
            let t = start + delta * CGFloat(i) / 16
            return CGPoint(x: cx + r * cos(t), y: cy + r * sin(t))
        }
    }

    /// The left eye: M543 1301 H647 A133 133 0 0 1 780 1434 V1525 A57 57 0 0 1 683 1563 L507 1394 A54 54 0 0 1 543 1301Z.
    /// The right eye is its mirror about x = 1024.
    static func eye(left: Bool) -> [CGPoint] {
        var p = [CGPoint(x: 543, y: 1301), CGPoint(x: 647, y: 1301)]
        p += arc(from: CGPoint(x: 647, y: 1301), to: CGPoint(x: 780, y: 1434), r: 133, large: false, sweep: true)
        p.append(CGPoint(x: 780, y: 1525))
        p += arc(from: CGPoint(x: 780, y: 1525), to: CGPoint(x: 683, y: 1563), r: 57, large: false, sweep: true)
        p.append(CGPoint(x: 507, y: 1394))
        p += arc(from: CGPoint(x: 507, y: 1394), to: CGPoint(x: 543, y: 1301), r: 54, large: false, sweep: true)
        return left ? p : p.map { CGPoint(x: 2048 - $0.x, y: $0.y) }
    }
}

private struct TaurusPart: Shape {
    let points: [CGPoint]
    func path(in rect: CGRect) -> Path {
        let s = min(rect.width / TaurusPath.box.width, rect.height / TaurusPath.box.height)
        var path = Path()
        path.addLines(points.map { CGPoint(x: rect.minX + ($0.x - TaurusPath.box.minX) * s, y: rect.minY + ($0.y - TaurusPath.box.minY) * s) })
        path.closeSubpath()
        return path
    }
}

private struct Charge {
    var lean: Double = 0
    var tuck: Double = 0
    var x: CGFloat = 0
}

struct TaurusMark: View {
    enum Mood { case rest, listening, thinking }
    var height: CGFloat
    var mood: Mood = .rest
    /// Each change makes him charge once.
    var charges = 0
    var color = Ink.primary
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    static func width(for height: CGFloat) -> CGFloat { height * TaurusPath.box.width / TaurusPath.box.height }

    var body: some View {
        let moving = mood != .rest && !reduceMotion
        KeyframeAnimator(initialValue: Charge(), trigger: reduceMotion ? 0 : charges) { c in
            TimelineView(.animation(minimumInterval: 1 / 30, paused: !moving)) { context in
                let t = context.date.timeIntervalSinceReferenceDate
                // Listening: a steady pinch. Thinking: slower and smaller.
                let pinch = moving ? (mood == .listening ? 7 * (0.5 - 0.5 * cos(t * 4.2)) : 4 * (0.5 - 0.5 * cos(t * 2.2))) : 0
                figure(pinch: pinch + c.tuck)
            }
            .frame(width: Self.width(for: height), height: height)
            .rotationEffect(.degrees(c.lean), anchor: .bottom)
            .offset(x: c.x)
        } keyframes: { _ in
            KeyframeTrack(\.lean) {
                CubicKeyframe(-9, duration: 0.16)      // lean back
                CubicKeyframe(-9, duration: 0.08)
                SpringKeyframe(4, duration: 0.14, spring: .snappy)   // burst
                SpringKeyframe(0, duration: 0.4, spring: .smooth)    // ease out
            }
            KeyframeTrack(\.tuck) {
                CubicKeyframe(0, duration: 0.1)
                CubicKeyframe(12, duration: 0.14)      // tuck the horns
                CubicKeyframe(12, duration: 0.1)
                SpringKeyframe(0, duration: 0.44, spring: .smooth)
            }
            KeyframeTrack(\.x) {
                CubicKeyframe(-1.5, duration: 0.24)
                SpringKeyframe(height * 0.35, duration: 0.14, spring: .snappy)
                SpringKeyframe(0, duration: 0.4, spring: .smooth)
            }
        }
        .accessibilityLabel("Taurus")
    }

    private func figure(pinch: Double) -> some View {
        ZStack {
            TaurusPart(points: TaurusPath.horn(left: true)).fill(color).rotationEffect(.degrees(pinch), anchor: TaurusPath.pivot)
            TaurusPart(points: TaurusPath.horn(left: false)).fill(color).rotationEffect(.degrees(-pinch), anchor: TaurusPath.pivot)
            TaurusPart(points: TaurusPath.eye(left: true)).fill(color)
            TaurusPart(points: TaurusPath.eye(left: false)).fill(color)
        }
    }
}
