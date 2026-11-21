# Design — "Velvet & Varnish"

A concert hall at night: velvet seats, varnished violins, brass. Canvas with all screens:
https://claude.ai/artifact/X7XRM2F98dML6sATzzqodo

## Tokens (source of truth: `src/renderer/src/styles/tokens.css`)
| Token | Hex | Use |
|---|---|---|
| velvet | #1E1220 | App background |
| box | #2B1A2C | Panels, keycaps |
| well | #241524 | Lanes, chord keys |
| seam | #4A3049 | Borders, dividers |
| ivory | #F4EADB | Main text |
| rosin | #BFA6B5 | Secondary text |
| varnish | #E8933F | The one action colour: buttons, selection, pressed keys |
| brass | #E9C46A | Time, tempo, meter, quarter-tone notes, focus ring |
| bowWood | #C9A36A | The bow's stick |

## Type
- **Bodoni Moda italic** — instrument names, screen titles, dynamics (pp … ff). Used with restraint.
- **Figtree** — all interface text.
- **IBM Plex Mono** — numbers, key letters, note names, small uppercase labels.

## The signature: the bow
Expression is drawn as a real violin bow: wooden stick, frog on the left, horsehair under it.
The hair lights up with the mouse wheel; dynamics marks sit beneath it. Nothing else on screen glows.

## Rules
- One accent (varnish) for actions; brass only for time and pitch information.
- Pills and rounded panels (radius 10–20); no left-border cards, no gradients washes, no emoji.
- Touch targets ≥ 44 px; visible focus ring (brass); text contrast ≥ 4.5:1.
- Copy: plain verbs, sentence case, say exactly what a control does.
