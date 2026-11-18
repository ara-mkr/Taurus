#!/bin/zsh
# SPDX-License-Identifier: GPL-3.0-or-later
# Builds OxNotch and libOxNowPlaying.dylib into .build/release with swiftc, the way Vorssaint's own build.sh does.
# Nothing is installed, downloaded or signed with a certificate: no dependencies, and the linker's ad-hoc signature.
# (Package.swift describes the same two products for `swift build` on a toolchain where SwiftPM works; on this Mac's
# Command Line Tools its PackageDescription library doesn't link, so this script doesn't depend on it.)
set -euo pipefail
cd "$(dirname "$0")"

out=.build/release
mkdir -p "$out"
flags=(-O -target "$(uname -m)-apple-macos14.0" -swift-version 5)

# Some Command Line Tools releases ship the same SwiftBridging module twice (module.modulemap and
# bridging.modulemap), which stops Foundation from building. Hide the duplicate from clang for this build only,
# through a VFS overlay in .build; nothing outside this folder changes.
tools="$(xcode-select -p)"
dup="$tools/usr/include/swift/bridging.modulemap"
if [[ -f "$dup" && -f "$tools/usr/include/swift/module.modulemap" ]] && grep -q "module SwiftBridging" "$tools/usr/include/swift/module.modulemap"; then
    : > .build/empty.modulemap
    cat > .build/vfs-overlay.yaml <<EOF
{ "version": 0, "case-sensitive": "false", "roots": [ { "type": "file", "name": "$dup", "external-contents": "$PWD/.build/empty.modulemap" } ] }
EOF
    # Both: clang's own imports, and the Swift frontend's rebuild of SwiftUI from its interface.
    flags+=(-vfsoverlay "$PWD/.build/vfs-overlay.yaml" -Xcc -ivfsoverlay -Xcc "$PWD/.build/vfs-overlay.yaml")
fi

echo "Compiling the Now Playing adapter (loaded by /usr/bin/perl)…"
swiftc "${flags[@]}" -emit-library -module-name OxNowPlaying Sources/OxNowPlaying/*.swift -o "$out/libOxNowPlaying.dylib"

echo "Compiling OxNotch…"
# A bare program asking for the camera needs its own Info.plist with a reason, or macOS stops it.
cat > .build/Info.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>local.oxbot.notch</string>
  <key>CFBundleName</key><string>Ox</string>
  <key>NSCameraUsageDescription</key><string>Ox shows your camera as a mirror in the notch, only while the Camera page is open. Nothing is recorded or sent.</string>
</dict></plist>
EOF
swiftc "${flags[@]}" -module-name OxNotch Sources/OxNotch/*.swift -o "$out/OxNotch" \
    -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker "$PWD/.build/Info.plist"

ls -l "$out/OxNotch" "$out/libOxNowPlaying.dylib"
echo "Run it on its own with: $PWD/$out/OxNotch"
