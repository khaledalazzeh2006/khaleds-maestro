# Progress

## Phase 0 — Skeleton + sound check ✅ done (tested on Windows: plays well on laptop speakers, total ≈ 58 ms, no felt delay — revisit in Phase 2)

What was built:
- Electron + React + TypeScript app, secure window, `media://` protocol for sample packs.
- Sound check screen in the Velvet & Varnish design: the bow (mouse wheel), keyboard map, latency panel.
- Piano test pack: Salamander, 30 notes × 4 loudness layers, Opus, ~18 MB.
- Verified in the cloud: typecheck, build, the app opens, the pack loads, a key press plays a note.

### كيف تجرّب (على ويندوز)
1. افتح Terminal في `D:\khaleds_music_app` واكتب `npm install` ثم `npm run dev`.
2. اعزف بصف A S D F … (المفاتيح البيضاء) وصف W E T Y U O P (السوداء).
3. حرّك عجلة الماوس: لازم الصوت يصير أنعم/أقوى وتتحرك الـ bow.
4. Space = تمسك الصوت (sustain). الأسهم ← → = أوكتاف.
5. اقرأ لوحة **Latency** وابعثلي رقم **Total** — بسماعات سلكية مش بلوتوث.
   - أقل من 20 ms ممتاز · 20–35 مقبول · أكثر من 35 بنعالجه في Phase 2.
6. قلّي: هل في تأخير محسوس؟ هل في طقطقة؟ هل الصوت واضح ونظيف؟

## Phase 1 — Sound library ✅ done (tested on Windows by Khaled: approved)

45 packs, 163 MB, Opus 160 kb/s. Builder: `tools/build_library.py`; checks: `tools/library_report.json`.
- Strings: solo violin, violins, violas, cellos (held, tremolo, short, pizzicato each), double bass (held, short, pizzicato), harp.
- Woodwinds: flute, oboe, clarinet, bassoon. Brass: horn, trumpet, trombone, tuba.
- Keys: grand piano (8 loudness layers), glockenspiel, marimba, xylophone.
- Percussion: timpani (+roll), bass drum, snare, crash, suspended cymbal, gong, conga, tumba, quinto, tambourine, triangle.

Per recording: tuning measured on its harmonics (fundamental only for mallets), loudness evened out
within each layer (±8 dB max), a loop found inside the sustain (strings/winds/brass, used from Phase 2),
silence trimmed. Every file is decoded again and re-measured:
- Held strings, winds and brass: within 0.5 c after correction (cellos 4.7 c, viola tremolo 6 c worst).
- Short and pizzicato notes: one take per pack disagrees with itself up to ~30 c between measurements
  (very short notes); takes that disagree with their siblings by >12 c take the siblings' median.
- Labelling fixes found by the checks: solo-violin pizzicato was an octave off; one clarinet note a semitone off.
- Piano tuning is left as recorded (a piano is stretch-tuned on purpose).
- Engine picks the nearest recorded note in the wanted loudness layer, or a nearer note from the
  neighbouring layer when the first would be stretched more than 3 semitones (horn has uneven layers).
- Keys outside an instrument's real range are dimmed and silent.

Known limits for Phase 2: memory (piano ≈ 820 MB decoded → store 16-bit, load per instrument),
no layer crossfade inside a held note yet, no loops yet (samples are 9–17 s, long enough for now),
no legato joins.

### كيف تجرّب
1. انسخ ملفات المكتبة (رح أحطها بالمجلد) — `resources/samples` لازم يكون فيه `library.json` و45 مجلد.
2. `npm run dev`.
3. اختار عائلة (Strings, Woodwinds…) ثم آلة، وجرّب كل طريقة عزف (Held / Tremolo / Short / Pizzicato).
4. ركّز على الوتريات: هل في نوتة نشاز؟ هل في نوتة أعلى أو أوطى بكثير من جاراتها؟ هل في نوتة بتطلع بأوكتاف غلط؟
5. اكتبلي اسم الآلة + النوتة (بتطلع تحت "Last note") لأي شي مش مزبوط.

## Phase 2 — Playing engine ✅ built, waiting for Khaled's test

`src/renderer/src/audio/engine.worklet.ts` (audio thread) + `sampler.ts` (loading, messages).
- The bow inside a held note: every loudness layer near the note runs together; the wheel crossfades
  them (tone changes, not just volume). Handover happens in the middle 40% between two layers, and when
  the bow rests for 0.3 s the stronger layer takes over alone at the same loudness — two takes held
  together beat against each other (measured: clarinet dipped 10 dB; now flat within 1 dB).
- Endless notes: equal-power loop crossfades; the builder now evens out the level inside each loop
  (slow gain only) so a player's natural fade doesn't pulse at every seam.
- Legato (on by default, key `): a new note while exactly one note is held starts past its attack and
  fades in over 60 ms while the old one fades out over 100 ms. Chords still work when legato is off.
- Every pack calibrated to the same full-bow loudness (`tools/calibrate.py`), capped by peak.
- 16-bit storage with cubic interpolation: piano ≈ 410 MB instead of 820 MB.
- Timed messages (sample-accurate playback, used from Phase 6) and an offline self-test (`#selftest`).
- Lowest-delay audio buffer by default (Linux test: 12 ms instead of 40 ms); "Safe" if it crackles.

Offline checks (rendered through the real engine): violin swell pp→ff→p and 30 s hold: smooth, no
clicks; 16 horn notes with a moving bow: no clicks, 12× faster than real time; legato line, piano with
pedal, long holds on trumpet/clarinet/flute/horn/tuba/basses/cello tremolo: steady, no clicks.

### كيف تجرّب
1. `npm run dev` (ما في داعي لـ npm install).
2. اختار **Solo violin**، امسك نوتة وحرّك العجلة ببطء من pp لـ ff وارجع: لازم يكبر الصوت ويتغيّر لونه بنعومة.
3. امسك نوتة أكثر من 20 ثانية: لازم ما تنقطع وما تسمع "نبض" بالصوت.
4. اعزف لحن والنوتات موصولة (اكبس الجديدة قبل ما تشيل القديمة) = legato. زر ` بيطفيه/بيشغّله.
5. شوف رقم Total بلوحة Latency: صار في "Lowest delay" — إذا سمعت طقطقة اختار "Safe".
6. جرّب كم آلة ثانية: لازم كلهم يطلعوا بنفس القوة تقريباً.

## Phase 3 — Play screen ✅ done (Khaled: approved — easy to play, chords + separate melody instrument)

- Instrument shelf on the left; two instruments at once: **melody** (follows the bow) and **chords**
  (own loudness slider, loads in the background). Choices and key are remembered.
- Three rows: Q row = melody high, A row = melody low (both follow the key, so every key fits),
  Z row = ten chords of the key (minor keys borrow the major V: Dm Gm A B♭ C F E° Dm7 Gm7 A7).
- Chords are voiced close to the previous chord (smallest movement, notes they share keep sounding),
  with an optional bass note on the root (C2–B2 register).
- Melody octave set automatically per instrument (← → to move); keys outside its range dim and stay silent.
- Last phrase: the last 8 notes, bigger when played harder.
- Engine: several instruments at once (note-offs per instrument, fixed level per instrument, legato per note),
  up to 4 instruments kept in memory so switching back is instant.

### كيف تجرّب
1. `npm run dev`.
2. اللحن: صف Q وصف A. الكوردات: صف Z (Z = Dm، X = Gm، C = A …).
3. جرّب لحن بإيد وكوردات بالإيد الثانية، وحرّك العجلة: الكمان بس بيتأثر، الكوردات على سلايدر "Chord loudness".
4. غيّر آلة الكوردات (زر Change chord instrument ← اختار من القائمة يسار) — جرّب Cellos وViolins.
5. غيّر المفتاح (+ / −) وMajor/Minor.
6. قلّي: هل ترتيب الكوردات مريح؟ هل الكوردات متغيّرة بنعومة؟ هل في شي بالشاشة مش واضح؟

## Phase 4 — Scales and maqamat ✅ built, waiting for Khaled's test

`src/renderer/src/music/theory.ts`
- **Free**: every key a semitone (A row from the tonic, Q row an octave up), chords in both colours.
- **Scale**: Major, Minor, Harmonic minor, Dorian, Phrygian, Mixolydian, Major and Minor pentatonic —
  the rows only hold notes of the scale; chords follow it (Dorian gets IV major, Phrygian ♭II, Mixolydian ♭VII).
- **Maqam**: Rast, Bayati, Saba, Hijaz, Kurd, Nahawand, Ajam, Sikah on any tonic, with real quarter tones
  (the engine plays fractional notes; measured: exactly 50.0 c on violin and flute). Notes spelled the
  Arabic way (E½♭, F♯½♭), quarter tones in gold on keys and in the scale strip.
- In maqam mode the bottom row becomes **drones** that latch (press once, they keep sounding): tonic,
  tonic + fifth, tonic + octave, low tonic, the ghammaz, tonic + ghammaz, 4th, 5th, open fifths, Off.
- Spelling: notes outside the key read as naturals, a raised leading tone as a sharp, anything else as a
  lowered key note (C in D mixolydian, E♭ in D phrygian).

### كيف تجرّب
1. `npm run dev`.
2. لوحة **Scale** على اليمين: جرّب Free ثم Scale (Dorian, Harmonic minor, Pentatonic) ثم Maqam.
3. بالمقام: اختار **Bayati** أو **Rast** — النوتات الذهبية فيها ربع تون. اعزف وشوف إذا "العربي" طالع صح.
4. صف Z صار drones: اكبس **X** (D + A) مرة وحدة، بيضل شغال؛ اعزف فوقه. **/** = Off.
5. للـ drones الأحسن آلة طويلة: غيّر آلة الصف السفلي لـ Cellos أو Violas.
6. قلّي: أي مقام صوته مش مزبوط؟ وهل في مقام بدك نضيفه؟

## Phase 5 — Metronome and odd meters ✅ done (Khaled: approved; Arabic rhythms wanted with the drums in Phase 7)

`src/renderer/src/audio/transport.ts`, `components/RhythmScreen.tsx`, `components/Wheel.tsx`
- Screens in the top bar: Play and Rhythm (Layers and Stage come later).
- Meters counted in eighths with their groups: 4/4, 3/4, 6/8, 5/8 (3+2), 7/8 (2+2+3 and 3+2+2), 9/8 (2+2+2+3),
  10/8 (3+3+2+2), 11/8 (2+2+3+2+2), 12/8. Tempo = quarter notes per minute (40–240), tap tempo.
- Metronome scheduled ahead on the audio clock (exact even when the screen is busy): high tick on the bar,
  middle tick on each group, soft tick on other eighths, or groups only. One-bar count-in (gold).
- The meter wheel: one dot per eighth, gaps between groups, the sounding step glowing; a small beat strip
  in the top bar so you can follow it while playing. Enter starts and stops from any screen.

### كيف تجرّب
1. `npm run dev` ← تبويب **Rhythm** فوق.
2. اختار **7/8 (2+2+3)** واكبس **Enter** (أو زر Start): بتسمع عدّ بار واحد (ذهبي) بعدين الإيقاع.
3. ارجع لـ **Play** — المترونوم بيضل شغال، والنقاط الصغيرة فوق بتورجيك وين انت بالبار. اعزف عليه.
4. جرّب **Tap the tempo**: اكبس 3–4 مرات على السرعة اللي ببالك.
5. قلّي: صوت المترونوم مريح؟ بدك مقاييس ثانية (متل إيقاعات عربية: مقسوم، سماعي ثقيل 10/8، أيوب)؟ — هاي ممكن نحطها بـ Phase 7 مع الطبول.

## Phase 6 — Recording layers ✅ built (Khaled: keep building, test later)

`music/song.ts`, `audio/playback.ts`, `components/LayersScreen.tsx`
- Record (● in the top bar or Shift + Enter): one-bar count-in, then melody keys, chords/drones, the bow
  and the hold pedal are recorded, in eighth-note steps (tempo changes keep everything in place).
- First recording sets the loop: press ● again to finish; it rounds up to whole bars and keeps looping.
  Later recordings play over the loop and finish by themselves after one pass.
- One pass makes up to two layers (melody and chords). Pick a layer on the Layers screen and the next
  recording becomes a new take of it (the old take is silent while you record); takes can be switched.
- Per layer: mute, solo, volume, timing help (each note moves part of the way to the nearest eighth,
  keeping its length; 30% by default), delete. Undo last take: Ctrl + Z. Start over clears all.
- Playback is scheduled ahead on the audio clock with the metronome (sample-accurate timed messages);
  instruments of recorded layers stay loaded. The piece is kept between sessions (saved files: Phase 8).
- Checked headless: record → loop plays back (timed notes sent), second take on the selected layer with
  auto-finish, undo, saved after restart.

Known limit: while a recorded melody plays, its bow automation also moves the same instrument if you play
it live at the same time (one bow per instrument). Mixing per layer comes in Phase 11.

## Phase 7 — Drums and tap rhythm ✅ built (Khaled: approved the direction)

`music/drums.ts`, `components/Wheel.tsx`, `components/RhythmScreen.tsx`
- Five drums as rings on the meter wheel, one cell per sixteenth (click: off → hit → accent):
  bass drum, dum (tumba), tak (conga), ka (quinto), riq (tambourine). VSCO has no darbuka/riq, so the
  conga family and tambourine stand in for them.
- Presets: Arabic — Maqsum, Baladi, Sa'idi, Wahda, Sama'i thaqil (10/8), Dawr hindi (7/8), Karsilama (9/8);
  odd-meter grooves — Yanni 7/8, 5/8, 9/8; Western — 4/4, waltz, 6/8. A preset sets its meter.
- Keys 1–5 play the drums live on any screen; "write what I tap" puts each tap on the nearest sixteenth
  while the clock runs (louder bow = accent). Drums play with the clock and the recorded loop.
- Per-drum mute, drum volume, clear. Changing the meter keeps the pattern (cut or padded).
- Checked headless: maqsum schedules dum/tak/ka/riq at the right gaps; taps land in the pattern.

## Phase 8 — Sections, timeline, transitions, save and open ✅ built, waiting for Khaled's test

`music/song.ts` (sections, arrangement, segments), `audio/playback.ts`, `components/SongScreen.tsx`, main-process IPC
- The **Song** tab: sections (Intro, Verse, Chorus …), each its own loop with its own layers; new, rename,
  duplicate, delete. Recording always goes into the section you are editing.
- **Timeline**: placements of sections in order, widths by length; repeat ×1–16, move ←/→, remove,
  per-placement layer on/off (e.g. Intro with only the violin).
- **How it comes in**: Straight, Build (last two bars swell from 70% with a growing snare roll, then crash
  and bass drum), Hit (crash + bass drum + timpani), Drop (half a bar of silence, back on a bass drum),
  Fade in (first two bars grow from silence). The drums follow the same rises and drops.
- **Loop this section / Play the whole song**; the song stops by itself at the end.
- **Files**: New, Open (Ctrl O), Save (Ctrl S), Save as (Ctrl Shift S) as `.maestro` (JSON: the song and the
  settings: key, rhythm and drums, instruments). Unsaved changes are marked • and asked about.
- Phase 6 pieces open as a single "Intro" section.
- Checked headless: migration, new section + recording, build into the verse (volume ramp, 14 snare hits,
  crash and bass drum on the downbeat), whole song stops by itself, save writes the file.

### Simplified recording (after Khaled's feedback)
- Play screen has a **record bar**: pick the section to record into, ● Record; while recording it says
  "Get ready… n to go", then "Recording Verse — bar 2 of 4", with Finish.
- Song screen: every section card has **● Record** (jumps to Play and starts the count-in) and **▶ Listen**.
- No more picking layers: recording again with the same instrument in a section makes a new take of it
  (the old take is silent meanwhile); a different instrument makes a new layer.

## Phase 9 — 3D stage ✅ built, waiting for Khaled's test

`audio/stage.ts`, `music/layouts.ts`, `components/StageScreen.tsx`
- The engine now has 12 outputs; every instrument group (instrument name; all drums together) plays
  through its own one, placed in space: PannerNode with HRTF (Headphones · 3D) or equal-power (Speakers),
  distance 1.5–8 m, darker (low-pass) and wetter further back, one shared synthetic hall reverb.
- Layouts: Concert hall, Wide stage, Close room, Takht; drag any instrument on the stage map; reset.
- Room: dry → big cathedral. Spotlight: the melody instrument up by a third, the others down by two thirds
  of the chosen amount (8 dB by default).
- Saved with the settings and in .maestro files.
- Checked live headless: violin hard left/centre/right gives L/R −26/−38, −24/−25, −37/−27 dB.

## Phase 10 — Quality guard ✅ built, waiting for Khaled's test

`music/quality.ts`, `components/QualityPanel.tsx` (on the Song screen; a count badge on the Song tab)
Works on the recorded notes (fast, updates as you edit), never changes anything until you press a fix:
- **Sudden jump**: loudness of the whole arrangement, per eighth (bow, chord level, layer volume, struck
  notes decaying, transitions, per-placement mutes). More than 6 dB louder within 1.5 s → at a section
  start: "Add a build-up before it"; inside a section: lower the layer that grew. Chosen entrances
  (build, hit, drop, fade) and the very start of the song are fine.
- **Clashing notes**: two layers holding notes a semitone (or minor ninth / major seventh) apart for an
  eighth or longer; quarter tones are never flagged. Fix moves the melody note (or the later one) to the
  nearest note of the key that does not rub.
- **Buried melody**: melody less than 3 dB above the loudest accompaniment while it plays (spotlight counted)
  → raise it.
- **Empty section on the timeline** → take it off.
- "It's on purpose" hides a finding; "Show me" opens the section.
- Checked headless with a song built to fail: all four found, all four fixed in one click each, then all clear.

## Phase 11 — Mix and export ✅ built, waiting for Khaled's test

`audio/render.ts`, `music/midi.ts`, `components/ExportPanel.tsx`, Mix panel on the Stage screen, `export:save` IPC
- **Mix** (Stage screen): a level per instrument group (−18 … +6 dB), on top of the spotlight; "Level everyone".
- **Export…** (Song screen): the whole song or the current section played N times; WAV for speakers
  (stereo) or headphones (3D), or MIDI.
- WAV: rendered offline through the very same engine, stage, hall, limiter, playback and drum code as live,
  as fast as the computer can; 24-bit / 48 kHz with TPDF dither, loudest moment at −1 dBFS, 4 s tail.
- MIDI: type 1, 480 PPQ, tempo + meter, one track per instrument (GM programs), drums on channel 10,
  velocity from how hard you played, bow → CC11, pedal → CC64, quarter tones → pitch bend (±2).
  Limit: two notes with different quarter-tone bends at the same moment on one track share one bend.
- Engine: timed messages are inserted in order (binary insert), so a whole song schedules quickly.
- Checked headless: test song rendered (12 s in 15 s on the cloud machine, real computers are faster),
  24-bit, peak −1.0 dBFS, level follows the music, 3D left/right differ; MIDI opens in a MIDI library with
  4 tracks, right programs, bends and drums.

## Phase 12 — Polish and Windows release ✅ built, waiting for Khaled's test

- **Installer** (electron-builder, NSIS, Windows x64): per-user, choose folder, Start-menu + desktop
  shortcuts, app icon (the bow and a note), `.maestro` files open in Maestro; the sound library ships inside.
  `npm run dist` builds it locally into `release\`.
- **Auto-update** (electron-updater from GitHub Releases): checks 4 s after start, downloads in the
  background, installs on quit or with "Restart and update" (a notice appears; also in About).
- **Release workflow** `.github/workflows/release.yml`: on a `v*` tag, builds on Windows and publishes the
  release using only the built-in `GITHUB_TOKEN` — no secrets or passwords. `ci.yml` typechecks every push.
  Steps in `RELEASE.md`; `npm run set-version x.y.z`.
- **Polish**: About dialog (version, check for updates, credits), first-run welcome (4 short steps),
  window size/position remembered, one window only (opening a file focuses it), strict CSP in the built
  page, all permission requests denied, no navigation away. Runtime dependencies cut to the updater only.
- Checked: built page with CSP runs (worklet, samples, fonts), tour and About work; the Windows build
  config packs app + 45 sound folders (final NSIS step needs Windows, done by the workflow / `npm run dist`).

## Next: Phase 13 — Learn inside the app + the book
