// SPDX-License-Identifier: GPL-3.0-or-later
// Ported from Vorssaint's UI/Notch/NotchAgentComponents.swift (AgentMarks, NotchAgentMark; Copyright (C) 2026
// Vorssaint). Each agent's mark is taken at run time from its maker's own app on this Mac: the image that app
// shows in the menu bar, drawn in ink, or else the app's icon. Nothing is bundled with OXBOT. With neither app
// installed, the agent's name stands in. See NOTICE.

import AppKit
import SwiftUI

enum AgentMarks {
    enum Mark { case template(NSImage), icon(NSImage) }
    private static var found: [Provider: Mark?] = [:]

    static func mark(for provider: Provider) -> Mark? {
        if let mark = found[provider] { return mark }
        let mark = lookUp(provider)
        found[provider] = .some(mark)
        return mark
    }

    private static func lookUp(_ provider: Provider) -> Mark? {
        for identifier in provider.appIdentifiers {
            guard let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: identifier) else { continue }
            if let bundle = Bundle(url: url) {
                for name in provider.menuBarImageNames {
                    if let image = bundle.image(forResource: name) {
                        image.isTemplate = true
                        return .template(image)
                    }
                }
            }
            return .icon(NSWorkspace.shared.icon(forFile: url.path))
        }
        return nil
    }
}

private extension Provider {
    /// The maker's desktop apps, the one that runs the agent first.
    var appIdentifiers: [String] {
        switch self {
        case .claude: return ["com.anthropic.claudefordesktop"]
        case .codex: return ["com.openai.codex", "com.openai.chat"]
        case .opencode: return ["ai.opencode.desktop", "ai.opencode.desktop.beta", "ai.opencode.desktop.dev"]
        case .copilot: return ["com.github.githubapp"]
        }
    }
    /// What those apps name the mark they show in the menu bar. OpenCode and GitHub show none; their icons stand in.
    var menuBarImageNames: [String] {
        switch self {
        case .claude: return ["TrayIconTemplate"]
        case .codex: return ["chatgptTemplate"]
        case .opencode, .copilot: return []
        }
    }
    /// Menu bar images keep a margin; Claude's thin rays need more of the box to look the same size.
    var markScale: CGFloat { self == .claude ? 1.45 : 1.2 }
}

/// An agent's mark at the size of a line of text.
struct AgentMark: View {
    let provider: Provider
    var size: CGFloat = 13
    /// Where the name is written beside it anyway, a missing mark leaves nothing rather than the name twice.
    var nameIfMissing = true

    var body: some View {
        switch AgentMarks.mark(for: provider) {
        case .template(let image):
            Image(nsImage: image).renderingMode(.template).resizable().interpolation(.high).scaledToFit()
                .frame(width: size * provider.markScale, height: size * provider.markScale)
                .foregroundStyle(Ink.primary)
                .accessibilityLabel(provider.name)
        case .icon(let image):
            Image(nsImage: image).resizable().interpolation(.high).scaledToFit()
                .frame(width: size * 1.35, height: size * 1.35)
                .accessibilityLabel(provider.name)
        case nil:
            if nameIfMissing { Text(provider.name).font(.system(size: 13, weight: .semibold)) }
        }
    }

    /// The width it takes in a row, for the closed island's wings.
    static func width(_ provider: Provider, size: CGFloat) -> CGFloat {
        switch AgentMarks.mark(for: provider) {
        case .template: return size * provider.markScale
        case .icon: return size * 1.35
        case nil: return Metrics.text(provider.name)
        }
    }
}
