# Roadmap

Each phase ends with something Khaled can test on his own machine. Sound comes before screens:
if the sound is late or unclear, no design can save the app.

## Stage 1 — Foundation
- **Phase 0 · Skeleton and sound check.** The app window in the Maestro look, one real grand piano
  played from the keyboard, the mouse-wheel bow, and a panel that shows the latency.
  *Done when:* a key press feels instant on Khaled's PC.
- **Phase 1 · Sound library.** Curated VSCO 2 CE instruments + Salamander piano, compressed into packs,
  with per-sample tuning and loudness data. *Done when:* every instrument loads and plays in tune.
- **Phase 2 · Playing engine.** AudioWorklet sampler: dynamic layers crossfading inside held notes,
  legato joins, round robins, releases, loops, voice limits, the bow driving real crescendos.
  *Done when:* a held violin note swells convincingly with the wheel.

## Stage 2 — Playing
- **Phase 3 · Play screen.** Instrument shelf, three-row keyboard (high melody, low melody, chords),
  octave and sustain, the bow, last-phrase view.
- **Phase 4 · Scales and maqamat.** Free / Scale / Maqam modes, quarter tones, drone row, key choice.

## Stage 3 — Making a piece
- **Phase 5 · Metronome and meters.** Odd meters with groupings (7/8 2+2+3, 9/8, 10/8…), tempo, count-in.
- **Phase 6 · Recording layers.** Record over what you have, several takes per layer, undo,
  gentle timing tightening that keeps the feel.
- **Phase 7 · Tap rhythm.** The rhythm wheel: taps become a looping pattern with human feel.
- **Phase 8 · Timeline.** Sections and tracks, move/copy regions, light note editing, save/open projects.

## Stage 4 — Sound and space
- **Phase 9 · 3D stage.** Place instruments around your head (HRTF), seating layouts, hall reverb,
  solo spotlight.
- **Phase 10 · Quality guard.** Sudden-jump, clashing-notes and buried-melody checks, each with a fix button.
- **Phase 11 · Mix and export.** Balance and limiter; export 3D or stereo audio, and MIDI.

## Stage 5 — Release and learning
- **Phase 12 · Polish and release.** Settings, first-run tour, performance, Windows/Mac installers,
  auto-update from GitHub.
- **Phase 13 · Learn inside the app (+ PDF book).** A "Learn" area in the app and an exportable book:
  getting started, the keyboard map, the art of the bow, scales and maqamat, building a whole piece
  step by step, rhythm, layers, stage, quality guard, and graded exercises.
