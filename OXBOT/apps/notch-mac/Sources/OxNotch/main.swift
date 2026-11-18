// SPDX-License-Identifier: GPL-3.0-or-later
// OxNotch: Ox in the notch on the built-in display and a floating pill on every other display, ported from
// Vorssaint's notch (https://github.com/vorssaint/vorssaint-utils, GPL-3.0-or-later). See NOTICE.
//
//   OxNotch [--server http://127.0.0.1:8787] [--managed] [--settings '{...}'] [--simulate-notch] [--open ox|music|agents|ask|settings]

import AppKit

let options = Options.parse(CommandLine.arguments)
let app = NSApplication.shared
// No Dock icon or menu bar of its own: it lives in the notch.
app.setActivationPolicy(.accessory)
let controller = NotchController(options: options)
app.delegate = controller
app.run()
