// swift-tools-version:5.9
// SPDX-License-Identifier: GPL-3.0-or-later
// OXBOT's notch, ported from Vorssaint (GPL-3.0-or-later). See NOTICE.

import PackageDescription

let package = Package(
    name: "OxNotch",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "OxNotch", targets: ["OxNotch"]),
        // Loaded into /usr/bin/perl, never into OxNotch: since macOS 15.4 MediaRemote only answers platform binaries.
        .library(name: "OxNowPlaying", type: .dynamic, targets: ["OxNowPlaying"]),
    ],
    targets: [
        .executableTarget(name: "OxNotch", path: "Sources/OxNotch"),
        .target(name: "OxNowPlaying", path: "Sources/OxNowPlaying"),
    ]
)
