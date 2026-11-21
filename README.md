# Maestro

Play the orchestra from your computer keyboard. You play every note yourself; Maestro makes it
easier to play well (scale lock, one-key chords, maqam mode) and records your layers into a piece.

Status: **Phase 12 — Windows release.** See [docs/ROADMAP.md](docs/ROADMAP.md).

## Install

Download `Maestro-Setup-<version>.exe` from the Releases page and run it (see RELEASE.md about SmartScreen).

## Run it from the source (Windows)

```
npm install
npm run dev
```

The sound library (~160 MB, 45 packs) lives in `resources/samples/` and is not in git. Build it with
`VSCO=<vsco-2-ce folder> SALAMANDER=<Salamander Samples folder> python3 tools/build_library.py`,
then `python3 tools/calibrate.py`
(needs Python with numpy, soundfile, soxr, and ffmpeg with libopus), or copy a built library in.

## Docs

- [docs/INSTRUCTIONS.md](docs/INSTRUCTIONS.md) — rules for working on the project
- [docs/ROADMAP.md](docs/ROADMAP.md) — the 14 phases
- [docs/DESIGN.md](docs/DESIGN.md) — the Velvet & Varnish design system
- [docs/PROGRESS.md](docs/PROGRESS.md) — what is done and how to test it
- [RELEASE.md](RELEASE.md) — publishing a new version

## Credits

- Salamander Grand Piano V3 — Alexander Holm, CC-BY 3.0
- VSCO 2 Community Edition — Versilian Studios, CC0 (from Phase 1)
- Fonts: Bodoni Moda, Figtree, IBM Plex Mono — SIL Open Font License
