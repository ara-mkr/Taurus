// swift-tools-version:5.9
// SPDX-License-Identifier: GPL-3.0-or-later
// Taurus's notch, ported from Vorssaint (GPL-3.0-or-later). See NOTICE.

import PackageDescription

let package = Package(
    name: "TaurusNotch",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "TaurusNotch", targets: ["TaurusNotch"]),
        // Loaded into /usr/bin/perl, never into TaurusNotch: since macOS 15.4 MediaRemote only answers platform binaries.
        .library(name: "TaurusNowPlaying", type: .dynamic, targets: ["TaurusNowPlaying"]),
    ],
    targets: [
        .executableTarget(name: "TaurusNotch", path: "Sources/TaurusNotch"),
        .target(name: "TaurusNowPlaying", path: "Sources/TaurusNowPlaying"),
    ]
)
