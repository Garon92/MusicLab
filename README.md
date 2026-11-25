# MUSICLAB

A single-screen music workstation for a desktop browser. Start with an empty grid, draw or play notes, arrange patterns and record the result. Audio processing and project storage run in the browser.

[Open MUSICLAB](https://garon92.github.io/MusicLab/)

## First session

1. Click an empty square in **Edit** to add a note. Click **Play** or press Space to loop the selected pattern. The track name and pattern letter above the grid show what you are editing.
2. Click a different cell in **Clip matrix** to edit another track or pattern. Click a track's **Type** to choose a synth, drum kit or sampler. Click **+** in the song row to append the current pattern to the arrangement.
3. Click the expand control in any panel to give it the whole workspace. **Full console** brings the panels back. **Commands** at the bottom opens a searchable list of actions. Its shortcut is Ctrl/Cmd+K.
4. Click **Reset** in the top right to start over. The confirmation shows what the current project contains. **Save a copy** downloads a portable project and keeps you working on it. **Reset project** stops playback and starts a blank project with the default instruments and mixer. **Undo** steps back immediately. **File → Restore last reset** also works after reloading the page in the same browser when local storage is available. The last tape take is recoverable with Restore in the same tab.

## Workspace

| Area | Controls |
| --- | --- |
| Transport | Play, note record, tape, position, tempo, swing, signature, key and scale, metronome, output meter, MIDI input, undo/redo and project files |
| Clip matrix | Eight tracks × eight patterns, with mute, solo, level, pan, clip and pattern menus and a 32-slot song chain |
| Edit | Note grid, piano keys, drum pads or sample slices. Velocity, probability and repeat lanes, scale folding, chords and Euclidean rhythms |
| Device | Synth, drum machine or sampler on the selected track, drive and effect sends |
| Signal | Scope, pitch, spectrum, spectrogram, phase and levels of the output, selected track or input. Hold freezes the display |
| Master | Delay, reverb, EQ, compressor, limiter and output gain |
| Status line | The full name of the control under the pointer, its gestures and feedback for the last action |

## Editing and playing

- **Draw** places notes. Drag a note to move it or its end to change its length. Right-click deletes it. **Select** lets you drag a box around a phrase. Shift-click adds or removes individual notes.
- Move a selection with the pointer or arrows. Shift+Up/Down transposes pitched notes by an octave. **Dup** or Ctrl/Cmd+D copies the phrase. **Del** removes it. Each finished gesture is one undo step.
- **VEL** edits velocity, **PROB** the chance a note sounds and **RPT** the number of attacks across its length (1–8). With notes selected, Shift-drag in a lane to change the whole selection.
- Click a numeric value to enter it directly. Drag or wheel to adjust it, hold Shift for finer changes, or right-click to restore its default. A focused control also accepts the arrow keys.
- Play the selected instrument with A–K. W, E, T, Y and U play the black keys on pitched instruments. Z/X changes octave. Keys 1–8 choose a track. Enable **Rec**, then start playback to write your playing into a clip.
- Drag a clip or pattern to copy it. Drag letters onto the song row to arrange a sequence and drag slots to reorder them. **Song** switches between the arrangement and the current pattern.
- Drop audio onto a track to load a sample. On a drum track, several files fill successive pads. **Tape** captures the live output. Click the finished **Take** to download it or drag it onto a track or pad to play it as a sample.

## Files

The project autosaves locally, with sample audio in IndexedDB. **File → Save project** downloads a JSON file with the referenced samples embedded. Open it from the File menu or drop it on the console.

**Import MIDI** accepts standard MIDI files of type 0 and 1. Its preview shows the track and pattern mapping, quantization and any limits reached before you replace the open project. **Export MIDI** writes the note performance with swing, arpeggios and repeats. MIDI uses instrument mappings, while a MusicLab JSON file keeps instrument settings, effects and samples.

**Export audio** renders the active song or pattern to a 24-bit stereo WAV. Use Tape for a live performance.

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

The self-test starts a local server and checks six desktop sizes, editing, playback, tape recording, audio and MIDI export, project files and reset recovery. To run the same suite in all three engines, install them with `npx playwright install chromium firefox webkit`, then run `MUSICLAB_BROWSERS=chromium,firefox,webkit npm test`.
