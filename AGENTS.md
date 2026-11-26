# MUSICLAB

MUSICLAB is a desktop browser music workstation. Keep the English console on one screen at the supported landscape size of 1100 × 620 and above. The layout scales in rem and each panel can expand for closer work. Use square controls, IBM Plex Mono and the established palette. Green carries signal data, amber marks selection and playback, and red marks recording or limiting. New projects start with editable synthesis patches, empty clips and empty samplers. Let users supply their own patterns and recordings. Keep labels short. Put full control hints in the status line and drive meters and analysis from the actual audio signal. Preserve purposeful file drops and contextual menus.

## Implementation

- GitHub Pages serves the static files in `docs/`. Keep runtime assets local and paths relative so the project also works under a repository subpath. The application uses classic browser scripts in the order defined by `docs/index.html`.
- `core.js` owns the schema, defaults, sanitizer, undo history and browser storage. `App.P` is the active project. Define parameters in `App.DEF`. Update both defaults and `sanitize` for new model fields, including note and clip attributes. Keep older saved projects readable. Commit one undo checkpoint per completed edit. Samples in IndexedDB are referenced by ID and embedded in portable project exports.
- Engines differ where it is audible, so measure before compensating: a `DynamicsCompressorNode` looks ahead about 6 ms (`App.compLag` holds the measured figure), and Firefox lets the first block through an idle compressor untouched and starts its fade-in only when signal first reaches it, so a cold compressor measures differently from a running one. A silent source keeps every strip and the master rendered between notes, so a control moved in silence is in place for the next note. A note played by hand must never cancel one the sequencer has already scheduled.
- `engine.js` builds the Web Audio graph. `seq.js` schedules transport and supplies the event timing used for playback, WAV bounce and MIDI export. Use the audio clock for musical timing. Use animation frames to draw the interface. Preserve continuous envelope releases. Keep the compressor warm-up and trim the silent lead-in from offline renders. Check delay feedback stability when changing its filter.
- `ui.js` provides shared controls, keyboard behavior, menus and file drops. `panels.js`, `editor.js` and `signal.js` render the console. `workspace.js` manages focus views and dialogs. Keep one visible home for each action. The operations, phrases, automation, song and patches modules own the corresponding controls. `main.js` coordinates file operations, live input and startup. MIDI file decoding belongs in `midi-import.js`.
- The console has one language for controls, and what a thing looks like says what the pointer does with it. A value has a bar under it: drag or wheel, Shift for fine steps, click to type, right-click to reset. A list has the list mark and opens `UI.menu`. A button is a frame; give it the class `tog` when it holds a state (it gets a lamp), `mnu` when it opens a menu, and end its name with … when it opens a dialog. Anything that can be picked up gets the class `dg` (a grip) and starts `UI.drag`; `UI.drop` marks what takes it, and those targets are outlined during the drag. Every object on the console answers a right-click with a `UI.menu` of what can be done to it. Draw marks in CSS: the bundled font has no arrows or symbols, so a glyph outside Latin falls back to a system font.
- `finder.js` is the map of the console: every tool under the panel it lives in, with its key or the button that reaches it. Add each new tool, and each new key or gesture, to its catalogue.
- Dialogs are console panels, not web forms. `Workspace.begin` frames each one with its name and the only close button, so an editor adds no Close button of its own; Cancel discards a draft, and the button with the class `confirm-action` is what the dialog is for. Build fields from plain `select`, `input type=number`, `range` and `checkbox` elements with an `aria-label`: `ui.js` gives them the console's gestures and menus by delegation, and `dialog.css` decides how every one of them looks. There are three stylesheets: `style.css` for the console, `compact.css` for laptop sizes and `dialog.css` for every dialog. An editor adds layout rules to `dialog.css` and leaves `select`, `input`, sliders, switches, buttons and overflow alone. Nothing in a dialog scrolls. `Workspace.begin` pages any `.tool-list`, `.rack-list`, `.il-cables`, `.scene-cues` or `.transcript-scroll` that outgrows its box, so give a new kind of list one of those classes and keep column labels in a `.rack-labels` row. A dialog explains itself only in its status strip: put a control's hint in `data-tip` and what the dialog is for in a hidden `p.dlg-tip` of about 80 characters at most, with no paragraph of help in the layout. Draw canvases with the palette in `App.C`. A button named Close closes a dialog, and Cancel discards a draft. `tests/console-rules.cjs` audits every dialog state for these rules at three window sizes, so add each new dialog to its list. `tests/console-kit.cjs` drives the shared controls, object menus and drags with real input, and `tests/regressions.cjs` holds one check for each defect a review has found: add to it when you fix one.
- Keep the eight-track, eight-pattern model consistent across playback, editing and file transfers. A step is a sixteenth note. A pattern spans up to 16 bars within the 256-step limit, and the song chain holds up to 32 pattern references.
- Use the existing control gestures and keyboard shortcuts. Project replacement goes through an explicit user choice with undo. Request device access in response to the relevant user action.

## Verification

Serve the browser application directly from the repository root.

```sh
python3 -m http.server 8765 --directory docs
```

Install the test dependencies and run the browser regression suite. `docs/index.html` loads every stylesheet and script with a content stamp, and the suite refuses to run on stale ones: after editing a file in `docs`, run `npm run stamp`.

```sh
npm ci
npx playwright install chromium
npm run stamp
npm test
```

Check console overflow using actual scroll and client dimensions at 1100 × 620, 1280 × 720, 1366 × 768, 1600 × 900, 1920 × 1080 and 2560 × 1080. Exercise a real playback gesture and inspect browser errors. For DSP changes, measure finite samples, peak and RMS of an offline bounce. Report the test results and distinguish simulated devices from physical hardware.

The test runner starts its own local server. Set `MUSICLAB_CHROMIUM_PATH` to use an existing Chromium executable. For a change to audio timing or project files, also check playback and a round trip through the relevant import and export controls.

## Delivery

For requested project changes, commit directly to `main` after verification and push to `origin/main`. GitHub Pages publishes `main:/docs`. Respect a request to keep work local or review a change before publishing.
