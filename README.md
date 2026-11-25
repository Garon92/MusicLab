# MUSICLAB

A single-screen music workstation for a desktop browser. Start with an empty grid, draw or play notes, arrange patterns and record the result. Audio processing and project storage run in the browser.

[Open MUSICLAB](https://garon92.github.io/MusicLab/)

## First session

1. Click an empty square in **Edit** to add a note. Click **Play** or press Space to loop the selected pattern. The track name and pattern letter above the grid show what you are editing.
2. Click a different cell in **Clip matrix** to edit another track or pattern. Choose **Synth**, **Drums** or **Sampler** in **Device**. Click **Arrange…** in the song row and insert pattern letters in the order you want to hear them.
3. Use **Find** or **Ctrl/Cmd+K** to jump to a control. Try “warp”, “sidechain” or “reset”. Click the expand control in any panel to give it the whole workspace. **Full console** brings the panels back.
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
| Status line | The full name of the control under the pointer, its gestures and feedback for the last action |

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
| Launch a performance | **Clip matrix → Live…** launches clips or scenes on a step, beat or bar. Set each clip’s loop in sixteenths, record launches, then edit the captured events and play the take. |
| Work with recordings | The song row’s **Audio… → Timeline** imports files or records regions into eight mixer lanes. Move, trim, split and crossfade clips there. Split a region and select a different take on each piece to comp a performance. |
| Overdub a loop | **Audio… → Looper** captures layers against the same loop. Choose the input or instrument, add a pass and undo a layer while keeping earlier passes. |
| Slice or change tempo | On a sampler track, **Device → Play → Edit…** detects transients, edits slice boundaries and warps audio to a target tempo. Anchors set how much each passage stretches. The project keeps the original audio. |
| Write harmony and groove | **Chords…** in the song row sets the progression and the tracks that follow it. **Edit → Groove** extracts a timing and accent template from notes, taps or microphone claps. Blend it into a clip or edit individual offsets. |
| Modulate an instrument | **Device → Mod…** routes sources such as velocity, LFOs, audio envelopes and four named macros to destinations with independent ranges. Draw the macro curves under **Edit → Automation**. |
| Mix and deliver stems | **Master → Routing…** edits insert order, track-to-bus assignments and sidechain keys. Each drum pad also has its own drive. **File → Export stems…** renders aligned stereo WAVs to a ZIP archive. |
| Keep a reusable break | **File → Material library…** saves a whole pattern or individual clip with its instruments, notes, curves and sample audio. Search by name, tag or BPM, audition at the project tempo and drag the material name onto a free matrix cell, track or pattern. Insert finds a free destination automatically. |
| Use external MIDI | **MIDI → Connect devices** selects inputs, output, channels and clock direction. Learn a mix control, instrument cutoff or macro from a hardware CC. Arm **REC** and play to capture its movement, then edit the points in the clip’s automation lane. |

## Arrange, design instruments and recover performances

| Task | Console control |
| --- | --- |
| Move a whole chorus | Open **Song → Arrange**. Select a slot range, name the section and move it on the timeline. Insert space, split slots, copy or move a section, then **Apply arrangement**. Pattern notes and curves, audio takes, chord changes, launches and song cues follow the edit. |
| Conduct tempo and meter | In **Arrange → Tempo & Meter**, add tempo points, ramps and meter changes at musical positions. The transport, click, tempo-synced effects, WAV and MIDI export follow the map. |
| Sing an instrument part | Select a recorded or imported region in **Audio → Timeline → Transcribe**. Analyze a single voice or melody, audition the original and corrected pitches, review rows marked **Check**, then insert notes into the destination clip. |
| Recover the last improvisation | Click **Capture** in the transport after playing on the computer keyboard or MIDI input. Choose the last phrase or a bar range, audition it and write it to an empty clip. The recent-note buffer lasts for the current session. |
| Compose a repeating fill | In **Edit → Rules**, choose notes, the period, the pass and an optional Fill condition. Hold **Fill** or the backslash key during playback. The project seed controls chance decisions. **Print to clip** turns a complete heard pass into editable notes with its resolved repeats, pitches and timing. |
| Build a granular instrument | Load a sample and set **Device → Sampler → Mode** to **Grain**. Play a chord and move the grain position while the notes are held. Adjust grain size, density and spread. |
| Map an acoustic instrument | Choose **Zones** in the sampler's mode control and open **Zones…**. Map recordings to key ranges and velocity layers. Overlapping alternatives can rotate on successive strikes. Portable project files include the source recordings. |
| Change a mix over several bars | In **Master → Routing → Scenes…**, save named snapshots of selected tracks and settings. Recall a scene live or place a song cue and set its transition in bars. |
| Hear an individual frequency range | **Master → Routing → Parametric EQ…** offers four draggable bands per track. Drag for frequency and gain, use the wheel or the Q control for bandwidth and switch the monitor between band solo, dry reference and EQ output. **Level match A/B** compares dry and processed audio at matched levels. |

## Editing and playing

- **Draw** places notes. Drag a note to move it or its end to change its length. Right-click deletes it. **Select** lets you drag a box around a phrase. Shift-click adds or removes individual notes.
- Move a selection with the pointer or arrows. Shift+Up/Down transposes pitched notes by an octave. **Dup** or Ctrl/Cmd+D copies the phrase. **Del** removes it. Each finished gesture is one undo step.
- **VEL** edits velocity, **PROB** the chance a note sounds and **RPT** the number of attacks across its length (1–8). With notes selected, Shift-drag in a lane to change the whole selection.
- Click a numeric value to enter it directly. Drag or wheel to adjust it, hold Shift for finer changes, or right-click to restore its default. A focused control also accepts the arrow keys.
- Play the selected instrument with A–K. W, E, T, Y and U play the black keys on pitched instruments. Z/X changes octave. Keys 1–8 choose a track. Enable **Rec**, then start playback to write your playing into a clip.
- Drag a clip or pattern to an empty destination to copy it with its curves. Dropping onto existing material opens the Phrase preview. Drag letters onto the song row to arrange a sequence and drag slots to reorder them. **Song** switches between the arrangement and the current pattern.
- Drop audio onto a track to load a sample. On a drum track, several files fill successive pads. **Tape** captures the live output. Click the finished **Take** to download it or drag it onto a track or pad to play it as a sample.

## Files

The project autosaves locally, with sample audio in IndexedDB. **File → Save project** downloads a JSON file with the referenced samples embedded. Open it from the File menu or drop it on the console.

**Import MIDI** accepts standard MIDI files of type 0 and 1. Its preview shows the track and pattern mapping, quantization and any limits reached before you replace the open project. **Export MIDI** writes the note performance with swing, arpeggios and repeats. Automation uses MIDI controllers 7, 10, 74, 91 and 94. Incoming controller movements are fitted to the sixteenth-note grid. Use MusicLab JSON for exact curves, instrument settings, effects and embedded samples.

**Export audio** renders the active song, pattern or launcher performance to a 24-bit stereo WAV, up to 20 minutes per render. Use Tape for a live performance.

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

The self-test starts a local server and checks six desktop sizes, editing, playback, tape recording, audio and MIDI export, project files, scoped edits, extended phrases, automation, patch recall, song variations and reset recovery. Production checks also exercise tempo-map timing, ripple edits across audio and note tracks, recovered playing across transport restarts, note conditions and printed passes, melodic transcription, granular and multisample rendering, scene morphs, loudness-matched EQ, stem contents, portable projects and simulated MIDI hardware. To run the same suite in all three engines, install them with `npx playwright install chromium firefox webkit`, then run `MUSICLAB_BROWSERS=chromium,firefox,webkit npm test`.
