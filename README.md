# MUSICLAB

A single-screen music workstation for a desktop browser. Start with an empty grid, draw or play notes, arrange patterns and record the result. Audio processing and project storage run in the browser.

[Open MUSICLAB](https://garon92.github.io/MusicLab/)

## Pocket Band

A second instrument face for children who play by ear and pictures. Short Czech labels name the pictures and controls. Open **KIDS** beside **FIND**, or bookmark [Pocket Band](https://garon92.github.io/MusicLab/?kids). The browser remembers which face you used. Each starts with its own project.

- **Start with a picture.** A new score opens on the farm. Tap the cow to hear it. On an empty pattern, a faint cow with a plus shows where a note could go. Tap two beats in its row to place two sounds. Tap or right-click a filled beat to remove it. You can also drag its picture back to the sounds at the left. Drag the cow from its pad to stamp a beat. Drag a placed picture to an empty beat to move it, or into a different row to change its sound. It keeps its note length and accent. Select the animal collection and add a cat. Both play together. The eight dots on each source card show where that source plays in the current loop. Holding a step cycles through an accent and a sustained note or double hit.
- **Choose what plays.** The twelve cards on the left each open six rows. Alongside drums, bass, melody and your voice are eight sound collections: **Farma**, **Zvířata**, **Doma**, **Venku**, **Džungle**, **Legrace**, **Hračky** and **Vesmír**. Try putting a monkey on the first beat, a fart on the third and a spring on the fifth. The collections hold 48 different one-shots: 41 real recordings and seven made-up space and toy sounds, all starting on the beat and levelled to the same loudness. Hold a musician for its sound variants. [Sound sources and credits](docs/audio/kids/CREDITS.md)
- **Play a rhythm by hand.** Tap a picture at the left of the score to hear it. Choose **Rytmus → Hrát na obrázky** to start a loop of the selected piece. Tap those pictures in time and watch the notes land on the nearest beat. **Hotovo** finishes writing and lets the loop keep playing. **Guma** names what you can erase. Within a piece, choose one row, its instrument or collection, or all notes. A separate choice clears that instrument or collection across A–D. **Zpět** restores the edit.
- **Choose where an effect applies.** The button above the effects names the affected instrument and the pieces it covers. Choose **Všechny dílky** for its usual sound, **Jen dílek A** (or B, C, D) for an override, or **Celá kapela** for the whole mix. Each musician has its own channel. Picture collections share channels in pairs: Farma with Džungle, Zvířata with Legrace, Doma with Hračky, and Venku with Vesmír. Both names appear on the effect selector. Their notes can still be played and erased separately.
- **Shape the sound.** Drag the picture across the square, or drag a row picture onto it to audition that sound. The pictures and labels at the ends of each axis show the range. **Ozvěna** controls echo and reverb, **Ostrost** controls brightness and distortion, **Chvění** controls vibrato speed and depth, and **Poloha** controls stereo position and volume. For the whole band, choose **Ozvěna** or adjust bass and treble in **Barva**. Expand the whole-band echo to set its spacing and feedback. **Nahrát pohyb** captures a gesture for the selected piece. **Obnovit efekt** restores the selected effect. On a piece this removes its override so it follows the channel again. The waveform and spectrum above the score show the actual mix.
- **Set the volume.** **Hlasitost** beside **Rychlost** has five steps, the loudest kept low for children's ears. The browser remembers it; **Zpět** and opening another song leave it as it is.
- **Watch the band.** **Kapela** at the bottom right puts everyone with notes in what Přehrát plays (this piece, or the whole song) on a stage: the musicians on a riser at the back, the pictured sounds gathered in front. Each one hops on its own notes, on the desk too. In a song, those with nothing in the piece now playing sit back until theirs comes. Some meet in a little scene when they play on the same beat: try a dog and a cat, a cow and a rooster, rain and thunder, or the drums, bass and melody together. Tap anyone on stage to hear them. **Noty** or Escape goes back to the notes.
- **Record a voice.** Tap the microphone to start and tap again to finish, or wait six seconds. The voice musician plays the recording at different pitches and has a backwards costume. The recording and songs stay in this browser.
- **Make a song.** Each of the four lettered pieces has its own picture and loop. The song strip shows both the letter and the picture at each position. Drag a piece onto the strip, then move it along the strip to change the order. The insertion mark shows where it will land. Tap the empty plus at the end to append the selected piece. To take one occurrence out, drag it off the strip until **Odebrat** appears, or right-click its picture. **Zpět** restores it. Tap **Pořadí dílků** for larger pieces and arrow buttons. In that view, holding a dragged piece over a page arrow takes it to the next or previous eight slots. The song holds up to 32 pieces. The selector beside Play chooses the current piece or the whole song.
- **Keep a song.** Open **Písničky** to reach **Moje písničky**, where you can save the current work, start a new song or open one of eight saved songs. Saving keeps a snapshot on the shelf. **Zpět** and **Vpřed** step through edits to the open song, including edits made before you saved it. Use Ctrl/Cmd+Z to undo and Ctrl/Cmd+Shift+Z to redo. **Uložit změny** updates the saved copy. Each cover has its own **Smazat** button: hold it until its ring fills, a tap only shakes it. A song that was never saved goes onto the first free place on the shelf before **Nová písnička** or opening another song replaces it. **Vrátit smazání** brings a deleted song back to its place during the current session.
- **Return to the desk.** Hold the lock for two seconds to recover your console project. To work on a child’s song in the full workstation, hold its filled shelf cover for two seconds and choose **Open in console**. The notes, effect routes, automation and recording travel together. Console Undo restores the project you had open.

## First session

1. Click an empty square in **Edit** to add a note. Click **Play** or press Space to loop the selected pattern. The track name and pattern letter above the grid show what you are editing.
2. Click a different cell in **Clip matrix** to edit another track or pattern. Choose **Synth**, **Drums** or **Sampler** in **Device**. Click **Arrange…** in the song row and insert pattern letters in the order you want to hear them.
3. **Find** or **Ctrl/Cmd+K** opens the map of the console: every tool under the panel it lives in, with its key or the button that opens it, and the list of keys and gestures. Type to narrow it and press Enter to go there. Try “warp”, “sidechain” or “reset”. Click the expand control in any panel to give it the whole workspace. **Full console** brings the panels back.
4. Choose **File → Reset project…** to start over. The confirmation shows what the current project contains. **Save a copy** downloads a portable project and keeps you working on it. **Reset project** stops playback and starts a blank project with the default instruments and mixer. **Undo** steps back immediately. **File → Restore last reset** also works after reloading the page in the same browser when local storage is available. The last tape take is recoverable with Restore in the same tab.

## Workspace

| Area | Controls |
| --- | --- |
| Transport | Play, note record, tape, position, tempo, swing, signature, key and scale, metronome, output meter, MIDI input, undo/redo and project files |
| Clip matrix | Eight tracks × eight patterns, with mute, solo, level, pan, phrase and batch tools, plus a 32-slot song chain |
| Edit | Note grid, piano keys, drum pads or sample slices. Velocity, probability and repeat lanes, a parameter automation editor, scale folding, chords and Euclidean rhythms |
| Device | Synth, drum machine or sampler on the selected track, drive and effect sends |
| Signal | Scope, pitch, spectrum, spectrogram, phase and levels of the output, selected track or input. Hold freezes the display |
| Master | Delay, reverb, EQ, compressor, limiter and output gain |
| Status line | The full name of the control under the pointer, its gestures and feedback for the last action. An open dialog carries the same line along its lower edge |

## One language for every control

What a thing looks like says what the pointer does with it, on the console and in every editor.

| What you see | It is | What it does |
| --- | --- | --- |
| A value with a bar under it | Number | Drag or wheel to change it, Shift for fine steps, click to type, right-click to reset |
| A value with a small triangle | List | Click for the list, wheel or drag to step through it, right-click to reset |
| A frame | Button | Press it. A name ending in … opens an editor, a triangle opens a menu |
| A frame with a square lamp | Switch | Lit means on |
| A dotted grip on the left edge | Something to pick up | Drag it. Every place that takes it is outlined while you drag, and Escape calls the drag off |
| A clip, pattern letter, track name, song slot, pad or the tape take | Object | Right-click for what can be done to it. Double-click a name to rename it |

- **Right-click menus.** Clip: duplicate to the next free cell, clear, length and repeat, batch edit, save to the library. Pattern letter: add to the song, duplicate, clear every track, length. Track name: rename, change the device, patch, modulation, routing, EQ, clear all clips. Song slot: start here, edit its pattern, remove. Drum pad: rename, load audio, back to its init sound. Take: save or discard.
- **Drags.** A clip onto a cell copies it. A pattern letter onto another letter copies every track, onto the song row adds it to the song. Song slots drag to reorder. A track name onto another track copies its device. A drum pad onto another pad copies its sound, with Alt held the two swap. The take, library entries and audio files from the desktop drop onto tracks and pads.
- **Pattern length** is the bar count on each pattern letter: a value like any other. Notes past the end are kept but not played.
- **Alt-click** on M or S mutes all the others or solos only that track. A second Alt-click clears the column.
- **Editors** are framed like the panels. × or Escape closes one. The button with the thick frame is what the editor is for, and Ctrl/Cmd+Enter presses it. Every list in an editor opens the console's own menu, a list too long for the window breaks into columns, and typing jumps to a choice. Right-click returns a field to the value it opened with.

## Change a phrase, a group of tracks or a whole section

| Musical task | Where to work |
| --- | --- |
| Repeat two bars of drums under a longer melody | Select the drum clip. Open **Phrase…**, choose **Clip** and **Repeat a range**. Set the source bars and total copies. The preview shows the resulting length before you apply. |
| Combine performances | In **Phrase…**, choose the source clip or pattern. Insert, append, overlay or replace a range. Stretch or compress time to change the spacing and durations of notes along with their automation. |
| Tighten several tracks together | In **Batch edit… → Notes**, choose a timing, pitch or dynamics operation such as backbeat or tresillo accents, then its scope. **Custom** lets you pick tracks and patterns independently. The preview counts the changes and **Undo** reverses the batch. |
| Clean up or return to a starting point | **Batch edit… → Clean up** removes duplicates, silent notes, overlaps, notes or parameter curves in the chosen scope. **Defaults** restores expression, devices, selected mixer sections or parts of the master effects rack. Loaded sample assignments survive a device reset. |
| Draw a fade or filter sweep | Select a clip, then **Edit → Automation**. Choose a mix control, instrument cutoff or a macro. Click to add points and drag to move them. Choose a linear glide or stepped hold. **Shape** generates a rise, fall, triangle, sine or pulse. Select **Draw** or **Select** to return to notes. |
| Make only the final chorus sound different | In **Arrange…**, select the chorus slot and choose **Make variation**. Apply to copy its notes and curves to a free pattern. For a repeated section, Shift-click the ends of a slot range, set the number of additional copies and choose **Repeat range**. |
| Reuse a sound | **Device → Patch…** offers factory sounds, instruments from other tracks and named settings saved in this browser. Copying from another track includes its sample assignments. Saved settings use the destination track’s samples. |

A pattern can span up to 16 bars within a 256-sixteenth-note limit. Longer patterns have four-bar pages in the editor. A song contains up to 32 pattern references. Notes and curves belong to the pattern. Independent variations use one of the eight pattern banks.

## Performance and production

| Task | Console control |
| --- | --- |
| Launch a performance | **Clip matrix → Live…** launches clips or scenes on a step, beat or bar. Set each clip’s loop in sixteenths, record launches, then edit the captured events and play the take. A launch takes the transport over from the pattern and the song: while it runs, the song row’s button and the position display read **Live** in amber. It ends when you stop the transport, and Play is the selected pattern or the song again; clicking **Live** in the song row hands the transport back without stopping. A recorded take stays the source until you click **Take** there. |
| Work with recordings | The song row’s **Audio… → Timeline** imports files or records regions into eight mixer lanes. Move, trim, split and crossfade clips there. Split a region and select a different take on each piece to comp a performance. A take from the microphone is moved earlier by the **Input delay**, so playing to the beat lands on the beat: it starts at what the browser reports for the way out and the way in, and you can trim it after clapping on the click. Right-click returns to the reported figure. |
| Overdub a loop | **Audio… → Looper** captures layers against the same loop. Choose the input or instrument, add a pass and undo a layer while keeping earlier passes. |
| Slice or change tempo | On a sampler track, **Device → Play → Edit…** detects transients, edits slice boundaries and warps audio to a target tempo. Anchors set how much each passage stretches. The project keeps the original audio. |
| Write harmony and groove | **Chords…** in the song row sets the progression and the tracks that follow it. **Edit → Groove** extracts a timing and accent template from notes, taps or microphone claps. Blend it into a clip or edit individual offsets. |
| Modulate an instrument | **Device → Modulation…** routes sources such as velocity, LFOs, audio envelopes and four named macros to destinations with independent ranges. Draw the macro curves under **Edit → Automation**. |
| Mix and deliver stems | **Master → Routing…** edits insert order, track-to-bus assignments and sidechain keys. Each drum pad also has its own drive. **File → Export stems…** renders aligned stereo WAVs to a ZIP archive. |
| Keep a reusable break | **File → Material library…** saves a whole pattern or individual clip with its instruments, notes, curves and sample audio. Search by name, tag or BPM, audition at the project tempo and drag the material name onto a free matrix cell, track or pattern. Insert finds a free destination automatically. |
| Use external MIDI | **MIDI → Connect devices** selects inputs, output, channels and clock direction. Learn a mix control, instrument cutoff or macro from a hardware CC. Arm **REC** and play to capture its movement, then edit the points in the clip’s automation lane. |

## Arrange, design instruments and recover performances

| Task | Console control |
| --- | --- |
| Move a whole chorus | Open **Song → Arrange**. Select a slot range, name the section and move it on the timeline. Insert space, split slots, copy or move a section, then **Apply arrangement**. Pattern notes and curves, audio takes, chord changes, launches and song cues follow the edit. |
| Conduct tempo and meter | In **Arrange → Tempo & Meter**, add tempo points, ramps and meter changes at musical positions. The transport, click, tempo-synced effects, WAV and MIDI export follow the map. |
| Sing an instrument part | Select a recorded or imported region in **Audio → Timeline → Transcribe**. Analyze a single voice or melody, audition the original and corrected pitches, review rows marked **Check**, then insert notes into the destination clip. |
| Recover the last improvisation | Click **Capture…** in the transport after playing on the computer keyboard or MIDI input. Choose the last phrase or a bar range, audition it and write it to an empty clip. The recent-note buffer lasts for the current session. |
| Compose a repeating fill | In **Edit → Rules**, choose notes, the period, the pass and an optional Fill condition. Hold **Fill** or the backslash key during playback. The project seed controls chance decisions. **Print to clip** turns a complete heard pass into editable notes with its resolved repeats, pitches and timing. |
| Build a granular instrument | Load a sample and set **Device → Sampler → Mode** to **Grain**. Play a chord and move the grain position while the notes are held. Adjust grain size, density and spread. |
| Map an acoustic instrument | Choose **Zones** in the sampler's mode control and open **Zones…**. Map recordings to key ranges and velocity layers. Overlapping alternatives can rotate on successive strikes. Portable project files include the source recordings. |
| Change a mix over several bars | In **Master → Scenes…**, save named snapshots of selected tracks and settings. Recall a scene live or place a song cue and set its transition in bars. |
| Hear an individual frequency range | **Master → EQ…** offers four draggable bands per track. Drag for frequency and gain, use the wheel or the Q control for bandwidth and switch the monitor between band solo, dry reference and EQ output. **Level match A/B** compares dry and processed audio at matched levels. |

## Sound design and measurement

| Task | Console control |
| --- | --- |
| Build a playable instrument | On a synth track, choose **Engine → Modular** in the device header and press **Wire…** to open the patch graph. Add oscillators, noise, impulses, envelopes, amplifiers, filters or resonators. Connect module outputs to audio or modulation inputs, route the result to the output and save the instrument under **Patch**. Only what a cable path joins to **Output** is heard: a module outside it is drawn dashed, and a patch with nothing reaching the output says so in the editor and on the device. Right-click a module to cable or remove it. Ctrl/Cmd+Z steps back inside the editor. |
| Record the result of a chain | In **Audio → Resample**, choose a track, bus or master, a musical range and the tail in seconds. Tracks and buses offer before/after FX taps. Send the print to a region at the original position or to a sampler. |
| Edit a sound in time and frequency | Select a timeline region and open **Spectrum**. Drag a rectangle on the spectrogram, then isolate the selection or change its gain. Listen to the original, processed or removed signal. Save a new take, or send an isolated selection directly to a sampler. |
| Sequence independent cycles | **Edit → Cycles** has separate clocks, phases and directions for pitch, accent and gate. Enter MIDI keys or note names, use a dash for a rest, and audition on the current instrument. **Print range** writes the chosen time span. **Capture last** keeps the recently heard events, including edits made during audition. Both create editable notes in an empty clip. |
| Automate across pattern boundaries | In **Arrange → Song automation**, choose a track and parameter, then click or drag points on the ruler. Adjust each outgoing bend, hold a value, repeat a range or stretch it to a new length. **Apply arrangement** commits the draft. In Song mode, this lane takes priority over the matching clip lane. Ripple edits carry it with the section. |
| Process signals in parallel | **Master → Routing → Split after inserts** offers parallel paths, three frequency bands or Mid/Side. Select a branch to set its gain, solo it and edit its own effects. The branches recombine before the output. |
| Resynthesize a sample | Choose **Wavetable** in the synth's Voice section. Import a recording or pick a project sample, set its fundamental and extract cycles from different positions. Edit the sine and cosine harmonics per frame, then sweep through frames manually or route a modulation source to wavetable scan. |
| Measure an effects path | **Signal → Bench** sends a calibrated tone or stepped frequency sweep through a track or bus rack and compares the input and output. Choose the input level and stereo stimulus, inspect transfer gain, harmonics or impulse peak delay, and use **Hold A** to overlay a measurement with matching test settings. |
| Use a recorded impulse | **Master → Reverb → IR…** accepts an impulse-response file or a project sample. The selected response is embedded in the portable project and used by the live return and offline render. |
| Change instrument tuning | **File → Project tuning** imports Scala `.scl` files or accepts ratios and cents directly. Set the root, reference key and frequency. Sustain a chord to switch between standard and project tuning. Project JSON and rendered audio preserve the tuning. Standard MIDI export carries note numbers. |

## Editing and playing

- **Draw** places notes. Drag a note to move it or its end to change its length. Right-click deletes it. **Select** lets you drag a box around a phrase. Shift-click adds or removes individual notes.
- Move a selection with the pointer or arrows. The **Move** arrows above the grid act on the selected notes, or on the whole clip when nothing is selected. Shift+Up/Down transposes pitched notes by an octave. **Dup** or Ctrl/Cmd+D copies the phrase. **Del** removes it. Each finished gesture is one undo step.
- Every note carries four values: **VEL** (velocity), **PROB** (the chance it sounds on a pass), **RPT** (1–8 hits across its length) and **LEN** (length in steps). The row above the grid shows them for the selected notes as ordinary console values: drag, wheel, type, or right-click to go back to the default. A selection that disagrees reads as a range. With nothing selected the row says **Next note** and sets what the next note you draw will get.
- The lane under the grid shows one of those values for every step (**Lane**: VEL, PROB or RPT), with the number beside each bar when there is room. Drag to set, right-click to reset, wheel to nudge; Shift-drag sets the whole selection. The readout at the top right shows what the notes on the step under the pointer really have.
- **Length** in the editor header is the pattern's length in bars, the same value as on the pattern letter in the matrix. On pitched tracks, **Chord** makes a click draw a triad or a seventh chord of the scale.
- A value that sits where a right-click would leave it is dim; one that was changed is bright. That holds for every value on the console and for the bars in the lane. A value that is set but has no effect in the state the device is in (an LFO with no destination, glide in poly mode) is dimmer still, and its hint says what would wake it. A value a curve drives is amber.
- Nothing changes what you hear without showing on the console. A button whose dialog holds something active is lit with a bar under it, and its hint says what: **Modulation…**, **Routing…**, **Track EQ…**, **Scenes…**, **Chords…**, **Audio…**, **Arrange…** and the editor's **Automation**. BPM and SIG read **Map** while a tempo or meter map follows bar 1, and show what the playhead is in. SCALE reads **Tuned** while a project tuning is on. The song row's button names what the transport follows.
- A control that cannot be used right now still answers the pointer: the status line says why, and a click says it again. Right-click a module's name to reset every value in it; a track's menu resets its device or its mixer strip.
- A note held against the side of the page turns the page under it, so it can be stretched or carried past the four bars in view. A pad's row in the editor has the pad's menu. **REC** reads **REC FREE** while recorded notes keep the timing they were played with (**Groove… → Live recording timing**).
- Space is always play and stop, unless you are typing in a field. Delete, the arrows, Ctrl/Cmd+A and Ctrl/Cmd+D act on the selected notes wherever you last clicked. Undo says what it changed and, while the song plays, does not restart it unless the song's structure changed.
- Click a numeric value to enter it directly. Drag or wheel to adjust it, hold Shift for finer changes, or right-click to restore its default. A focused control also accepts the arrow keys. The same gestures work on every field of every editor.
- Play the selected instrument with A–K. W, E, T, Y and U play the black keys on pitched instruments. Z/X changes octave. Keys 1–8 choose a track. Enable **Rec**, then start playback to write your playing into a clip.
- Drag a clip or pattern to an empty destination to copy it with its curves. Dropping onto existing material opens the Phrase preview. Drag letters onto the song row to arrange a sequence and drag slots to reorder them; right-click a slot to remove it. **Song** switches between the arrangement and the current pattern.
- Drop audio onto a track to load a sample. On a drum track, several files fill successive pads. **Tape** captures the live output. Click the finished **Take** to download it or drag it onto a track or pad to play it as a sample.

## Files

The project autosaves locally, with sample audio in IndexedDB. Audio that the project, its last reset and this tab's undo history no longer use is cleared from that store when the console starts and no other MusicLab tab is open. **File → Save project** downloads a JSON file with the referenced samples embedded. Open it from the File menu or drop it on the console. The file is written and read in pieces, so long recordings do not run into the browser's limit on one string.

**Import MIDI** accepts standard MIDI files of type 0 and 1. Its preview shows the track and pattern mapping, quantization and any limits reached before you replace the open project. **Export MIDI** writes the note performance with swing, arpeggios and repeats. Empty bars in the song are marked as rests and come back as empty bars. Automation uses MIDI controllers 7, 10, 74, 91 and 94. Incoming controller movements are fitted to the sixteenth-note grid. Use MusicLab JSON for exact curves, instrument settings, effects and embedded samples.

**Export audio** renders the active song, pattern or launcher performance to a 24-bit stereo WAV, up to 20 minutes per render, and runs on until the sound has died away. **Export loop** writes a file exactly as long as the music: what rings on after the end is laid back over the start, so the file repeats without a gap. Use Tape for a live performance.

## Run locally

Serve the static files in `docs`. The app has no build step.

```sh
python3 -m http.server 8765 --directory docs
```

Open [localhost:8765](http://localhost:8765/). The console fits desktop landscape windows from 1100 × 620. Microphone and hardware MIDI access depend on browser support, permission and a secure origin such as HTTPS or localhost.

## Browser checks

```sh
npm ci
npx playwright install chromium
npm test
```

The self-test starts a local server and checks six desktop sizes, editing, playback, tape recording, audio and MIDI export, project files, scoped edits, extended phrases, automation, patch recall, song variations and reset recovery. Production checks also exercise tempo-map timing, ripple edits across audio and note tracks, recovered playing across transport restarts, note conditions and printed passes, melodic transcription, granular and multisample rendering, scene morphs, loudness-matched EQ, stem contents, portable projects and simulated MIDI hardware. Two suites guard the interface itself: one audits every editor for the console's rules at three sizes, the other drives the shared controls, the right-click menus and the drags with real pointer and key events. A third keeps the defects found in review fixed. Recording is tested through a stand-in microphone on the engine's own clock; how late a real interface is can only be heard on real devices. After changing a file in `docs`, run `npm run stamp` so the page loads the new version. To run the same suite in all three engines, install them with `npx playwright install chromium firefox webkit`, then run `MUSICLAB_BROWSERS=chromium,firefox,webkit npm test`.
