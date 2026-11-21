# Maestro — project instructions

Read this first, every session. It is the contract for how this project is built.

## What we are building
A desktop app (Windows + macOS) for **playing** orchestral music from the computer keyboard.
The person plays everything themselves — melody, chords, solos. The app makes that easier
(scale lock, one-key chords, gentle timing help, a mouse-wheel "bow" for expression) but never
plays for them. Only two things come ready-made: the instrument sounds and the tapped drum loops.

Working name: **Maestro** (folder `D:\khaleds_music_app`). The name can still change.

## Non-negotiables
1. **The player plays.** No auto-composition, no external AI, no generated melodies.
2. **Sound first.** Real recordings, every sample tuned and loudness-evened, low latency.
   A feature that makes the sound worse does not ship.
3. **Offline and free.** No accounts, no paid services, no network needed to play.
4. **Transitions rule.** The quality guard enforces it: an entrance is either strong on purpose
   (and prepared), or it grows continuously. Never quiet-then-sudden.
5. **Every instrument gets its moment.** Solos sit about 8 dB above what surrounds them.
6. **Easy and beautiful.** Built for musicians with feeling, not for programmers.
   Follow `docs/DESIGN.md` exactly; UI copy in plain English, sentence case.

## How we work
- One phase at a time, in the order of `docs/ROADMAP.md`.
- Claude writes the code in this folder. Khaled runs it on Windows, tests with the steps in
  `PROGRESS.md`, and commits. A phase is done only when Khaled says it passed.
- `PROGRESS.md` is updated at the end of every phase: what was built, how to test, known limits.
- Changes are surgical: touch only what the task needs. No rewrites of working code.
- New dependencies need a reason written in the commit or PROGRESS entry.

## Tech
| Part | Choice | Why |
|---|---|---|
| Shell | Electron + electron-vite | Desktop app with web tech Khaled knows; Windows + Mac; GitHub auto-update later |
| UI | React 19 + TypeScript (strict) | Familiar, typed |
| Audio | Web Audio API (AudioWorklet from Phase 2) | Low-latency playback inside Chromium, HRTF built in |
| Samples | `media://` protocol → `resources/samples` (dev) / installed packs (later) | Fast local loading, no file:// fetch problems |
| Sample prep | Python tools in `tools/` (run by Claude) | Tuning + loudness data measured offline once |
| Fonts | Bundled via @fontsource (offline) | No network needed |

## Folder map
```
src/main/        Electron main process (window, media protocol)
src/preload/     Safe bridge to the renderer
src/renderer/    The app UI
  src/audio/     Audio engine, key maps, sample packs
  src/components/ React components
  src/styles/    tokens.css (design tokens) + app.css
resources/samples/  Sample packs used in development (not committed; see tools/)
tools/           Sample-pack builders (Python)
docs/            Instructions, roadmap, design
```

## Security
contextIsolation on, nodeIntegration off, sandboxed renderer, strict CSP,
the media protocol only serves files inside the samples folder.
