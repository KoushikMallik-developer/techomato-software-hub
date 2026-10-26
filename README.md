# Techomato Softwares

A website that offers desktop software, either as **browser apps** (no install) or as **Windows downloads**.
It currently ships 28 browser apps (see below).

Built with React 18, React Router and Vite. Apart from the libraries below (Office files, PDF, Markdown, highlighting), the apps have no dependencies, and files
are stored in the visitor's own browser (localStorage), so there is no backend to run.

## Design

Every page and app shares the Techomato look from the original portal: paper background, ink text, tomato accent (`#C8381F`),
Bricolage Grotesque headings, Instrument Sans body, pill buttons and the tomato-with-chevrons logo (`components/Brand.jsx`).
The theme lives in `src/styles.css` (tokens) and `src/styles/techomato.css` (applied last, restyles the shared app kits).
Fonts load from Google Fonts (see `index.html`); without network the system sans-serif is used.

## Run it

```bash
npm install
npm run dev        # development server (http://localhost:5173)
npm run build      # production build into dist/
npm run preview    # preview the production build
```

The build uses relative paths and hash routing (`#/software/docs`), so the `dist/` folder works on any
static host (Netlify, Vercel, GitHub Pages, Cloudflare Pages, a plain web server, or a sub-folder).

## Project layout

```
src/
  config.js            site name and tagline
  data/software.js     THE CATALOG - add new software here
  pages/               Home, software detail page, app launcher, 404
  components/          Layout, SoftwareCard, AppChrome (shared app frame + "My files")
  apps/                one file per app (DocsApp.jsx ... HabitsApp.jsx) plus a sub-folder of helpers each
  lib/                 useLibrary (storage), sheet formula engine, Office import/export (docx, xlsx, pptx)
  styles.css           all styling (light + dark)
```

## Adding new software

**A browser app**

1. Create `src/apps/MyApp.jsx`. Wrap it in `AppChrome` and store files with `useLibrary('myapp', blank)` as the
   existing apps do (or build any React component you like).
2. Register it in `src/pages/AppHost.jsx`: `myapp: lazy(() => import('../apps/MyApp.jsx'))`.
3. Add an entry to `src/data/software.js` with `platforms: ['browser']`, `status: 'available'`, `launch: '/app/myapp'`.

**A Windows download**

1. Put the installer in `public/downloads/` (or host it elsewhere, e.g. GitHub Releases).
2. Add an entry to `src/data/software.js` with `platforms: ['windows']`, `status: 'available'` and
   `download: { url: './downloads/setup.exe', version: '1.0.0', size: '85 MB' }`.

Set `status: 'coming-soon'` to list something before it is ready.

## The apps

| App | What it is |
| --- | --- |
| **Techomato Docs** | Word processor. Opens/saves .docx, HTML, Markdown, text; print to PDF. |
| **Techomato Sheets** | Spreadsheet with 260+ functions, charts, pivots, filters. Opens/saves .xlsx, CSV, TSV, JSON. |
| **Techomato Slides** | Presentations with themes, animations and presenter view. Opens/saves .pptx. |
| **Techomato Forms** | Surveys and quizzes with branching, results, CSV export, kiosk link and fillable HTML file. |
| **Techomato To Do** | My Day / Important / Planned, lists, steps, reminders, repeating tasks. |
| **Techomato Planner** | Boards, grid, schedule and charts; labels, members, checklists. |
| **Techomato Notes** | Notebooks with sections, pages, sub-pages, tags, rich text, recycle bin. |
| **Techomato Calendar** | Day, work week, week, month and agenda views; recurring events; .ics import/export. |
| **Techomato Money** | Accounts, budgets, bills, goals, reports, CSV import. |
| **Techomato Habits** | Habit tracker with streaks, counters, heatmap, statistics, achievements. |
| **Techomato Paint** | Raster editor with layers, selections, shapes, text, filters. |
| **Techomato Calculator** | Standard, scientific, graphing, programmer, date calculation, converters. |
| **Techomato Clock** | Focus sessions, timers, stopwatch, alarms, world clock. |
| **Techomato Photo Studio** | Layered photo editor: masks, blend modes, adjustment layers, selections, retouching, filters. |
| **Techomato Audio Studio** | Multitrack audio editor: record, edit, effects, spectrum, WAV export. |
| **Techomato Video Studio** | Timeline video editor: tracks, keyframes, transitions, titles, looks, WebM/MP4 export. |
| **Techomato Motion Studio** | Compositing and animation: keyframes, graph editor, expressions, effects, WebM / PNG-sequence export. |
| **Techomato 3D Studio** | 3D modelling and rendering on a custom WebGL 2 engine: edit mode, modifiers, sculpting, lights, keyframes, OBJ/STL. |
| **Techomato PDF Toolkit** | Merge, split, reorder, rotate, annotate, sign, watermark and number PDF pages (pdf-lib + pdf.js). |
| **Techomato Whiteboard** | Infinite canvas: pen, shapes, sticky notes, connectors; PNG/SVG export. |
| **Techomato Code Playground** | HTML/CSS/JS editor with live sandboxed preview, console, multiple files, ZIP export. |
| **Techomato Image Converter** | Batch convert/resize/compress JPG, PNG, WebP, AVIF, BMP, ICO; target file size; ZIP. |
| **Techomato Recorder** | Screen, screen + camera, camera and voice recording; WebM/MP4 where supported. |
| **Techomato Mind Maps** | Keyboard-driven mind maps; PNG, SVG, Markdown, OPML export. |
| **Techomato Vault** | Encrypted password manager (AES-256-GCM, PBKDF2), TOTP, audit, CSV import. |
| **Techomato Flowcharts** | Diagram editor with smart connectors, auto layout, Mermaid import/export. |
| **Techomato Writer** | Markdown editor with live preview, themes, outline; exports MD/HTML/PDF. |
| **Techomato Flashcards** | Spaced-repetition decks, cloze cards, study/cram/quiz, statistics. |

The "everyday" apps (everything except Docs, Sheets and Slides) share a Fluent-style UI kit:
`src/styles/fluent.css`, `src/components/fxui.jsx` (popovers, menus, dialogs, toasts), `AppBar.jsx` and
`src/lib/useStore.js` (localStorage persistence under `techomato:<name>`, with backup/restore from the top-bar menu).
Planner and Forms reuse some layout classes from `src/styles/money.css`.

Office file support uses `jszip`, `docx` and `pptxgenjs` (loaded on demand, so they do not slow down the
catalog pages).

The ten newest apps (PDF Toolkit through Flashcards) use the same Fluent kit as the everyday apps. PDF, Writer and Code Playground need `pdf-lib`, `pdfjs-dist`, `marked` and `highlight.js`.

The five Studio apps (Photo, Audio, Video, Motion, 3D) share a dark creative-suite kit: `src/styles/studio.css` and
`src/components/studio.jsx` (menus, scrubbable number fields, panels, history hook). Their engines live in
`src/apps/photo`, `audio`, `video`, `motion` and `threed`. Projects autosave to IndexedDB (`src/lib/idb.js`).

## Testing notes

This source was bundled with esbuild and exercised with Playwright/Chromium during development, and the
generated `.docx`/`.xlsx`/`.pptx` files were checked with python-docx/openpyxl/python-pptx and LibreOffice.
It has not been run through `npm install` + `vite` in the build environment (the npm registry was not
reachable there), so run `npm install` first and report any version-specific issue. The apps were checked
in Chromium only; they were not compared side by side with the Microsoft products they take inspiration from.

## Known limits

- Files live in one browser's localStorage (roughly 5 MB). There are no accounts or cloud sync yet.
  Large images use up that space quickly.
- Slides use a fixed 16:9 size. Other .pptx sizes are fitted into 16:9 on import.
- .pptx round-trip is good for text, shapes, pictures, tables, charts, notes and transitions. Not carried
  over: PowerPoint animations on export, SmartArt, embedded media/OLE, freeform shapes (become rectangles),
  gradient text, and master/layout placeholders (their artwork is imported as locked background shapes).
- The Docs editor uses the browser's built-in editing commands (`document.execCommand`). They are deprecated
  but still supported by every major browser; a library such as TipTap is the long-term upgrade.
- Alarms, timers, task reminders and habit reminders only fire while the page is open in a browser tab.
- Forms, Money, Planner and every other app keep data in the browser that created it. Forms responses
  from other people reach you through the fillable HTML file or by importing their response file.
- Studio apps: they cannot open Adobe/Blender project files (.psd, .prproj, .aep, .blend); each saves its own project
  format. Video and Motion export in real time through `MediaRecorder` (WebM; MP4 only where the browser supports it).
  Motion's effects use `ctx.filter`, which Safari lacks. 3D Studio is a real-time rasterizer with shadows from one sun or
  spot light, not a path tracer. Audio recording needs microphone permission. Large media is limited by browser memory.
- Paint works on one raster canvas in memory; very large canvases can hit browser limits.
- Vault: data and the encryption live in this browser only. A lost master password cannot be recovered. Clear site data
  and the vault is gone, so use the encrypted backup.
- Recorder: screen capture and system audio are not available on phones, and recordings are kept in this browser's IndexedDB.
  The app backup covers the list, not the video files. MP4 and AVIF depend on the browser.
- Code Playground CDN libraries and images in Writer documents load from the network. PDF Toolkit uses pdf.js 6, which needs a modern browser.
