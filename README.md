# MUSICLAB

A music workstation on one screen, in the browser. Eight tracks, eight patterns, a song chain, a synth, a drum machine, a sampler, send effects, a master chain and a signal analysis column. Nothing scrolls, nothing is decoration, and a new project contains no notes.

[Open MUSICLAB](https://garon92.github.io/MusicLab/)

## Screen

| Area | What it holds |
| --- | --- |
| Top bar | Play, note record, tape, position, tempo, swing, signature, key and scale, metronome, output meter, MIDI, undo, file menu |
| Matrix | 8 tracks × 8 patterns. Each row carries the track's mute, solo, level (with live meter) and pan. Each cell is a clip. The song chain sits below |
| Edit | The note grid of the selected clip: piano keys for a synth or pitched sampler, pads for drums, slices for a sliced sample. Velocity or probability per step below |
| Device | The selected track's instrument: SYNTH, DRUMS or SAMPLER, plus its drive and sends |
| Signal | Scope, pitch readout, spectrum, spectrogram, phase and level of the output, the selected track or the input |
| Master | Delay, reverb, EQ, compressor, limiter, volume |
| Status line | Says in full what is under the cursor and how to use it |

## Controls

Every value on the screen is the same control:

- drag or wheel to change, Shift for fine steps
- double-click to type an exact value (`1.5k`, `120ms`, `-6`, `C#3`)
- right-click to reset

Grid: click to place a note, drag right for length, drag a note to move it, drag its end to resize, right-click to delete. Rows that are sounding light a lamp at the left edge.

Right-click a clip, a pattern letter or a track name for its menu (clear, copy to the next pattern, add to song, rename).

Drag and drop:

- a clip onto another cell copies it
- a pattern letter onto another letter copies the whole pattern, onto the song row adds it to the chain
- song slots drag to reorder
- audio files from the desktop onto a track, a drum pad or a row of the drum grid load as samples (several files fill consecutive pads)
- the tape take onto a track or pad turns the recorded output into a sample

Keys: `Space` play, `A`–`K` play the selected track (`W E T Y U` are the black keys), `Z` `X` octave, `1`–`8` track, arrows track and pattern, `Ctrl/Cmd+Z` undo, `Ctrl/Cmd+S` save, `Esc` silence.

## Files

- The project saves itself in the browser. Samples are stored next to it.
- **FILE › SAVE** downloads one `.json` with the samples inside. **OPEN** or dropping that file loads it.
- **EXPORT WAV** renders the song (or the selected pattern when song mode is off) offline to 24-bit stereo.
- **EXPORT MIDI** writes a standard MIDI file, one track per console track.
- **TAPE** records whatever you hear in real time, including what you play live.

## Run locally

It is plain HTML, CSS and JavaScript with no build step. Serve the `docs` folder:

```bash
python3 -m http.server 8765 --directory docs
```

The console is drawn for a landscape window of 1100 × 620 or larger and scales as a whole with the window. In anything smaller it shows as a miniature with a notice.

Microphone input and MIDI need the browser's permission and a secure origin (`https` or `localhost`). Developed and tested in Chromium.
