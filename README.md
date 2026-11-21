# Techomato Softwares

A website that lists Techomato software: 11 free **browser apps** (no install, data stays in your browser) and a link to Techomato Colleges.

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

The build uses normal URLs (`/software/pdf`), so the host must send unknown paths to `index.html`
(`vercel.json` does this for Vercel) and serve the site from the domain root.

## Project layout

```
src/
  config.js            site name and tagline
  data/software.js     THE CATALOG - add new software here
  pages/               Home, software detail page, app launcher, 404
  components/          Layout, SoftwareCard, AppChrome (shared app frame + "My files")
  apps/                one file per app (PdfApp.jsx, MoneyApp.jsx, ...) plus a sub-folder of helpers each
  lib/                 useLibrary (storage), shared helpers
  styles.css           all styling (light + dark)
```

## Adding new software

**A browser app**

1. Create `src/apps/MyApp.jsx`. Use `AppBar` and store data with `useStore('myapp', initial)` as the
   existing apps do (or build any React component you like).
2. Register it in `src/pages/AppHost.jsx`: `myapp: lazy(() => import('../apps/MyApp.jsx'))`.
3. Add an entry to `src/data/software.js` with `platforms: ['browser']`, `status: 'available'`, `launch: '/app/myapp'`.

Set `status: 'coming-soon'` to list something before it is ready.

## The apps

| App | What it is |
| --- | --- |
| **Techomato Money** | Accounts, budgets, bills, goals, reports, CSV import. |
| **Techomato Photo Studio** | Layered photo editor: masks, blend modes, adjustment layers, selections, retouching, filters. |
| **Techomato Audio Studio** | Multitrack audio editor: record, edit, effects, spectrum, WAV export. |
| **Techomato Video Studio** | Timeline video editor: tracks, keyframes, transitions, titles, looks, WebM/MP4 export. |
| **Techomato Motion Studio** | Compositing and animation: keyframes, graph editor, expressions, effects, WebM / PNG-sequence export. |
| **Techomato 3D Studio** | 3D modelling and rendering on a custom WebGL 2 engine: edit mode, modifiers, sculpting, lights, keyframes, OBJ/STL. |
| **Techomato PDF Toolkit** | Merge, split, reorder, rotate, annotate, sign, watermark and number PDF pages (pdf-lib + pdf.js). |
| **Techomato Image Converter** | Batch convert/resize/compress JPG, PNG, WebP, AVIF, BMP, ICO; target file size; ZIP. |
| **Techomato Mind Maps** | Keyboard-driven mind maps; PNG, SVG, Markdown, OPML export. |
| **Techomato Vault** | Encrypted password manager (AES-256-GCM, PBKDF2), TOTP, audit, CSV import. |
| **Techomato Flowcharts** | Diagram editor with smart connectors, auto layout, Mermaid import/export. |

The apps share a Fluent-style UI kit: `src/styles/fluent.css`, `src/components/fxui.jsx` (popovers, menus, dialogs, toasts), `AppBar.jsx` and
`src/lib/useStore.js` (localStorage persistence under `techomato:<name>`, with backup/restore from the top-bar menu).
The PDF Toolkit needs `pdf-lib` and `pdfjs-dist`.
