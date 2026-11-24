# Bot face images

Taurus agent avatar design references generated on November 24, 2026 with the built-in image generation tool, using the owner's screenshot of the actual Taurus agent list as the visual reference. The owner requested these be saved and pushed for Claude to use later.

## Files

- `bot-face-images-15-horn-variants.png`: 15 horn and antler variants, five columns by three rows, on a transparent background. Read left to right, top to bottom.
- `bot-face-images-6-eye-types.png`: six eye treatments, three columns by two rows, on a white presentation background. Read left to right, top to bottom: round dots, horizontal dashes, squares, angled wedges, happy arches, wink.

## Direction for Claude

Use the small monochrome glyphs from the existing UI as the style reference: horns or antlers with two small eye marks underneath. The owner explicitly rejected illustrated ox heads and colored background boxes. Keep silhouettes simple and distinct at small avatar sizes. Mix horn variants and eye types as appropriate.

These PNGs are concept sheets, not individual production icons or SVG files. The eye sheet's white page is presentation only, not an avatar tile to reproduce. When implementing later, redraw selected glyphs as crisp scalable shapes, preserve consistent optical size and stroke weight, and check them in the actual UI at small sizes. This handoff does not change the running UI.

## Generation prompts

Horn sheet: exactly 15 minimal black Taurus glyphs in a 5 by 3 grid; broad U, narrow U, crescent, angular V, square U, ram curls, longhorn, lyre, one-branch antlers, two-branch antlers, moose antlers, tapered upright horns, wavy horns, inward hooks, swept branching horns. Identical dot eyes; transparent background; no animal faces, colored boxes, labels or UI.

Eye sheet: exactly six glyphs in a 3 by 2 grid with the same U-shaped horn bowl and only eyes varying: dots, dashes, squares, angled wedges, happy arches, wink. Solid black geometric shapes on a white page; no boxes, text, shadows or gradients.

Only the final horn sheet and refined eye sheet are included. Rejected portrait explorations and the faint intermediate eye sheet are excluded.
