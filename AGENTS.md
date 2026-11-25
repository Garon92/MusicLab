# MUSICLAB

MUSICLAB is a desktop browser music workstation. Keep the English console on one screen at the supported landscape size of 1100 × 620 and above. The layout scales in rem and each panel can expand for closer work. Use square controls, IBM Plex Mono and the established palette. Green carries signal data, amber marks selection and playback, and red marks recording or limiting. New projects start with editable synthesis patches, empty clips and empty samplers. Let users supply their own patterns and recordings. Keep labels short. Put full control hints in the status line and drive meters and analysis from the actual audio signal. Preserve purposeful file drops and contextual menus.

## Implementation

- GitHub Pages serves the static files in `docs/`. Keep runtime assets local and paths relative so the project also works under a repository subpath. The application uses classic browser scripts in the order defined by `docs/index.html`.
- `core.js` owns the schema, defaults, sanitizer, undo history and browser storage. `App.P` is the active project. Define parameters in `App.DEF`. Update both defaults and `sanitize` for new model fields, including note and clip attributes. Keep older saved projects readable. Commit one undo checkpoint per completed edit. Samples in IndexedDB are referenced by ID and embedded in portable project exports.
- `engine.js` builds the Web Audio graph. `seq.js` schedules transport and supplies the event timing used for playback, WAV bounce and MIDI export. Use the audio clock for musical timing. Use animation frames to draw the interface. Preserve continuous envelope releases. Keep the compressor warm-up and trim the silent lead-in from offline renders. Check delay feedback stability when changing its filter.
- `ui.js` provides shared controls, keyboard behavior, menus and file drops. `panels.js`, `editor.js` and `signal.js` render the console. `workspace.js` manages focus views and dialogs. Keep one visible home for each action. The operations, phrases, automation, song and patches modules own the corresponding controls. `main.js` coordinates file operations, live input and startup. MIDI file decoding belongs in `midi-import.js`.
- Dialogs are console panels, not web forms. `dialog.css` loads last and decides how every control in a dialog looks: one field style, capitals, a flat slider with a square mark, a square switch, the palette and no radius. A feature stylesheet lays its dialog out and leaves `select`, `input`, sliders, switches and overflow alone. Nothing in a dialog scrolls. `Workspace.begin` pages any `.tool-list`, `.rack-list`, `.il-cables`, `.scene-cues` or `.transcript-scroll` that outgrows its box, so give a new kind of list one of those classes and keep column labels in a `.rack-labels` row. A dialog explains itself only in its status strip: put a control's hint in `data-tip` and what the dialog is for in a hidden `p.dlg-tip` of about 80 characters at most, with no paragraph of help in the layout. Draw canvases with the palette in `App.C`. A button named Close closes a dialog, and Cancel discards a draft. `tests/console-rules.cjs` audits every dialog state for these rules at three window sizes, so add each new dialog to its list.
- Keep the eight-track, eight-pattern model consistent across playback, editing and file transfers. A step is a sixteenth note. A pattern spans up to 16 bars within the 256-step limit, and the song chain holds up to 32 pattern references.
- Use the existing control gestures and keyboard shortcuts. Project replacement goes through an explicit user choice with undo. Request device access in response to the relevant user action.

## Verification

Serve the browser application directly from the repository root.

```sh
python3 -m http.server 8765 --directory docs
```

Install the test dependencies and run the browser regression suite.

```sh
npm ci
npx playwright install chromium
npm test
```

Check console overflow using actual scroll and client dimensions at 1100 × 620, 1280 × 720, 1366 × 768, 1600 × 900, 1920 × 1080 and 2560 × 1080. Exercise a real playback gesture and inspect browser errors. For DSP changes, measure finite samples, peak and RMS of an offline bounce. Report the test results and distinguish simulated devices from physical hardware.

The test runner starts its own local server. Set `MUSICLAB_CHROMIUM_PATH` to use an existing Chromium executable. For a change to audio timing or project files, also check playback and a round trip through the relevant import and export controls.

## Delivery

For requested project changes, commit directly to `main` after verification and push to `origin/main`. GitHub Pages publishes `main:/docs`. Respect a request to keep work local or review a change before publishing.
