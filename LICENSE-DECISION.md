# License decision pending

The owner has not selected a public software license for Taurus. This planning pack does not claim that a future product is open source or that a license has been granted for third-party material.

Recommendation for discussion: Apache-2.0 for an eventual open-source client/core, a separate trademark policy for the Taurus identity, and explicit descriptions of any managed-service boundaries. Compare this with MIT or a copyleft strategy with appropriate legal advice and business goals before choosing.

Before public release, select and include the actual license text, verify contributor rights, record dependencies and copied material, include required notices, and confirm rights to logos, illustrations, fonts and other assets. External reference links do not grant asset rights.

## November 17, 2026: the native notch is GPL-3.0

`apps/notch-mac` (TaurusNotch, the native notch) is ported from Vorssaint (https://github.com/vorssaint/vorssaint-utils, commit 89d2626089d693bf0462ba29ea5d047d80c9da2e), which is GPL-3.0-or-later. TaurusNotch is therefore GPL-3.0-or-later too; its `LICENSE` and `NOTICE` (what was ported) sit in that folder, and `docs/20-native-notch.md` describes it.

The desktop app starts TaurusNotch and ships it beside itself when it is built. So **if Taurus is ever distributed with the native notch, Taurus must be released under GPL-3.0** (with its source), not Apache-2.0 or MIT as recommended above. Builds stay personal for now, which the GPL allows. To keep a non-GPL option open, ship without `apps/notch-mac` (the desktop app then uses its own Electron notch, which shares no code with Vorssaint).

## Earlier note

No external repository code or third-party skill implementation is bundled in this pack. The four Taurus-specific skills and the HTML study are newly authored planning assets. No legal clearance or trademark ownership is represented.
