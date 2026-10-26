/*
  The Techomato software catalog. To add a new product, add an object to this array.

  Fields
  - id          unique slug, used in URLs (#/software/<id>). For browser apps it is also the AppLogo id
                (src/components/AppLogo.jsx) and the route (/app/<id>).
  - platforms   ['browser'], ['windows'] or ['browser', 'windows']
  - status      'available' | 'coming-soon'
  - launch      route of a browser app (e.g. '/app/docs'), only for status 'available'
  - icon        emoji shown for products that have no AppLogo yet (coming-soon items)
  - download    Windows download: { url, version, size } - put installers in public/downloads/
                or link to external hosting. Leave null until a real file exists.
*/
const BROWSER = 'Any modern browser (Chrome, Edge, Firefox, Safari).';
const app = (o) => ({ platforms: ['browser'], status: 'available', launch: `/app/${o.id}`, version: '1.0', requirements: BROWSER, ...o });

export const software = [
  /* ---------------- Office ---------------- */
  app({
    id: 'docs', name: 'Techomato Docs', category: 'Office', color: '#185abd',
    tagline: 'A full word processor in your browser.',
    description: 'Write reports, letters and notes with rich formatting, tables, images and comments. Open and save Word (.docx) files, and keep everything automatically saved on your device.',
    features: [
      'Paragraph styles, fonts, sizes, colours, highlight, superscript/subscript, capitalisation',
      'Lists (bullets, numbers, checklists), indents, spacing, text direction',
      'Tables with merge/split, borders and sorting; images, links, special characters',
      'Table of contents, page breaks, headers, footers, page numbers, columns, pageless view',
      'Comments, find and replace, word count, document outline, zoom, full screen',
      'Open and save Word (.docx), HTML, Markdown and text; print to PDF',
      'Templates, autosave, version history, multiple documents',
    ],
  }),
  app({
    id: 'sheets', name: 'Techomato Sheets', category: 'Office', color: '#107c41',
    tagline: 'Spreadsheets with a real formula engine.',
    description: 'Crunch numbers with 260+ functions, charts, pivot tables, filters and conditional formatting. Open and save Excel (.xlsx) and CSV files.',
    features: [
      'Formula engine with 260+ functions, named ranges and cross-sheet references',
      'Charts, sparklines, conditional formatting, data validation and dropdowns, checkboxes',
      'Sort, filter, pivot tables, remove duplicates, freeze panes, merge cells, number formats',
      'Find and replace, paste special, fill series, notes, links, multiple sheets with tab colours',
      'Open and save Excel (.xlsx), CSV, TSV, JSON and HTML; print setup',
      'Templates, autosave, version history',
    ],
  }),
  app({
    id: 'slides', name: 'Techomato Slides', category: 'Office', color: '#c43e1c',
    tagline: 'Design and present slide decks.',
    description: 'Build presentations with themes, shapes, charts and animations, then present full-screen with a presenter view. Open and save PowerPoint (.pptx) files.',
    features: [
      'Text, shapes, lines and arrows, images, tables and charts with live data editing',
      '10 themes, slide layouts, backgrounds (solid, gradient, image)',
      'Smart guides, snapping, rotate, group, align and distribute, layering, lock',
      'Rich text: lists, links, fonts, colours, highlight, line spacing; find and replace',
      'Animations (build in/out) and slide transitions, with a presenter view: notes, timer, pen, laser',
      'Open and save PowerPoint (.pptx); export HTML slideshow, PNG, PNG zip; print to PDF',
      'Slide sorter, templates, hidden slides, speaker notes, autosave, version history',
    ],
  }),
  app({
    id: 'forms', name: 'Techomato Forms', category: 'Office', color: '#00756a',
    tagline: 'Build surveys and quizzes, review the results.',
    description: 'Create forms from templates or from scratch, with branching, quiz scoring and a live results view. Share a fillable HTML file or a kiosk link, and bring responses back as a file.',
    features: [
      'Question types: choice, text, rating, date, ranking, Likert, Net Promoter Score and sections',
      '6 templates plus blank and quiz; drag to reorder; required questions and validation',
      'Branching logic, one-question-at-a-time mode, quiz mode with correct answers and scores',
      'Results as summary charts, individual responses or a table; export to CSV',
      'Share as a kiosk link or a standalone fillable HTML file, and import response files',
      'Open and close dates, one response per browser, themes and colours',
    ],
    requirements: BROWSER + ' Responses are stored in the browser where the form is filled in; use the fillable HTML file to collect from other people.',
  }),

  /* ---------------- Productivity ---------------- */
  app({
    id: 'todo', name: 'Techomato To Do', category: 'Productivity', color: '#2564cf',
    tagline: 'Plan your day and never lose a task.',
    description: 'A clean task manager with My Day, Important and Planned views, custom lists, steps, due dates, reminders and repeating tasks.',
    features: [
      'My Day, Important, Planned and All tasks smart views, with daily suggestions',
      'Custom lists with colours and icons; drag to reorder tasks',
      'Steps, notes, due dates, reminders and repeating tasks (daily, weekdays, weekly, monthly, custom)',
      'Sort, search, undo, keyboard shortcuts and dark mode',
      'Import and export tasks as CSV or text; full backup and restore',
    ],
  }),
  app({
    id: 'planner', name: 'Techomato Planner', category: 'Productivity', color: '#2f7d32',
    tagline: 'Boards, schedules and charts for your plans.',
    description: 'Organise projects as buckets and tasks with a Kanban board, grid, schedule and charts. Track progress, priority, labels, members, checklists and due dates.',
    features: [
      'Board view with drag and drop between buckets, plus Grid, Schedule and Charts views',
      'Tasks with progress, priority, labels, members, checklists, notes and dates',
      'Filter, group and sort; a "My tasks" view across every plan',
      'Plan templates, duplicate, archive, import and export (JSON, CSV)',
      'Sample plans to explore, autosave, backup and restore',
    ],
  }),
  app({
    id: 'notes', name: 'Techomato Notes', category: 'Productivity', color: '#7719aa',
    tagline: 'Notebooks with sections, pages and rich text.',
    description: 'Capture ideas in colour-coded sections and pages with sub-pages, a rich-text editor, tags, a recycle bin, search and Markdown or HTML export.',
    features: [
      'Colour-coded sections, pages and sub-pages; move pages between sections',
      'Rich text, checklists, tables, images, links and tags; pin important pages',
      'Search across notes, page duplication, recycle bin',
      'Import .md, .txt and .html files; export pages as Markdown or HTML',
      'Autosave in your browser, backup and restore',
    ],
  }),
  app({
    id: 'calendar', name: 'Techomato Calendar', category: 'Productivity', color: '#0f6cbd',
    tagline: 'Day, week and month views with repeating events.',
    description: 'Schedule events with colours, locations, reminders and recurrence. Switch between Day, Work week, Week, Month and Agenda views.',
    features: [
      'Day, Work week, Week, Month and Agenda views with a mini calendar',
      'Events with location, notes, colours and all-day; drag to move and resize',
      'Recurring events with "this / this and following / all" editing, and reminders',
      'Search, import and export (.ics), backup and restore',
    ],
  }),

  /* ---------------- Life ---------------- */
  app({
    id: 'money', name: 'Techomato Money', category: 'Life', color: '#0b7a75',
    tagline: 'Budgets, accounts and spending reports.',
    description: 'Track accounts and transactions, set budgets, see where your money goes, and plan bills and savings goals. Everything stays on your device.',
    features: [
      'Accounts (checking, savings, cards, cash, investments), transfers and split transactions',
      'Register with filters, running balance, bulk actions, reconcile and CSV import',
      'Monthly budgets by category with progress, plus reports: donut, cash-flow and trend charts',
      'Recurring bills and income that post automatically, upcoming bills, savings goals',
      'Currency formatting, net-worth overview, export and backup',
    ],
    requirements: BROWSER + ' Data is stored in this browser only; use Backup regularly.',
  }),
  app({
    id: 'habits', name: 'Techomato Habits', category: 'Life', color: '#e0701a',
    tagline: 'Build habits, keep streaks, see your progress.',
    description: 'Track daily routines with check-ins, counters and timers. Watch your streaks, completion rate and achievements grow, with a heatmap and calendar.',
    features: [
      'Yes/no, count and duration habits; limits ("at most 2 coffees"); skip days',
      'Schedules: every day, specific days, N times a week, every N days; time of day',
      'Streaks, best streaks, 7/30-day and all-time rates, notes and a daily motivation line',
      'Statistics: year heatmap, weekly and monthly trends, weekday chart, achievements',
      'Month calendar, 20 habit ideas, reminders while the page is open, CSV export, backup',
    ],
  }),

  /* ---------------- Creative ---------------- */
  app({
    id: 'paint', name: 'Techomato Paint', category: 'Creative', color: '#d42f66',
    tagline: 'Draw, edit and layer images.',
    description: 'A ribbon-style paint program with brushes, shapes, text, selections, fills and layers. Save PNG or JPEG, or keep an editable project.',
    features: [
      'Brushes, pencil, eraser, fill with tolerance, colour picker, magnifier and text tool',
      '20 shapes; rectangle and free-form selection with move, resize, flip, rotate and crop',
      'Layers with opacity, blend modes, rename, reorder, merge and flatten',
      'Image resize and colour adjustments such as brightness, contrast, sepia and invert',
      'Undo/redo, zoom up to 1600%, autosave, save PNG/JPEG or an editable project file, print',
    ],
  }),

  /* ---------------- Studio (creative suite) ---------------- */
  app({
    id: 'photo', name: 'Techomato Photo Studio', category: 'Studio', color: '#31a8ff',
    tagline: 'Layered photo editing, retouching and compositing.',
    description: 'A Photoshop-style editor in the browser: layers with masks and blend modes, non-destructive adjustment layers, selections, retouching tools, text, shapes and filters.',
    features: [
      'Layers with 16 blend modes, opacity, masks, clipping masks, layer styles and free transform',
      'Non-destructive adjustment layers such as Curves, Levels and Hue/Saturation',
      'Marquee, lasso, magic wand and colour-range selections with feather, expand and contract',
      'Brush, eraser, clone stamp, blur/sharpen/smudge, dodge/burn, gradient, bucket, type and shapes',
      '17 filters including blurs, noise reduction, spherize/twirl/ripple distortions, vignette and tilt-shift',
      'Opens common image files; saves PNG/JPEG/WebP or an editable .photo.json project; autosave',
      'Does not open Photoshop .psd files',
    ],
  }),
  app({
    id: 'audio', name: 'Techomato Audio Studio', category: 'Studio', color: '#2fd1b0',
    tagline: 'Multitrack audio recording, editing and mixing.',
    description: 'An Audition-style multitrack editor: record from a microphone, cut and arrange clips on tracks, apply effects, watch the spectrum and export a mix.',
    features: [
      'Multitrack timeline with split, trim, move, fades, gain, pan, mute/solo and snapping',
      'Import audio files, record from your microphone (browser permission needed) and generate tones or noise',
      'Effects: 3-band equalizer, high/low-pass, compressor, reverb, echo, distortion, noise gate, normalize, reverse, speed change',
      'Waveform and spectrum views with level meters and markers',
      'Undo/redo, autosave and session files; export the mix as a WAV file',
    ],
  }),
  app({
    id: 'video', name: 'Techomato Video Studio', category: 'Studio', color: '#9a6bff',
    tagline: 'Timeline video editor with titles, looks and export.',
    description: 'A Premiere-style non-linear editor: arrange video, image and audio clips on tracks, add titles, transitions and colour looks, and export a finished video.',
    features: [
      'Multi-track timeline (3 video + 2 audio tracks) with split, ripple delete, duplicate, copy/paste and markers',
      'Media bin for video, audio and images; clip speed, volume and fades',
      'Keyframes for position, scale, rotation and opacity; fade, slide, wipe and zoom transitions',
      'Title clips and colour looks (Warm, Cool, Noir, Vintage) with colour adjustments',
      'Exports WebM (or MP4 where your browser can record it). Export runs in real time',
      'Large or high-resolution clips depend on your computer; does not open Premiere .prproj projects',
    ],
  }),
  app({
    id: 'motion', name: 'Techomato Motion Studio', category: 'Studio', color: '#f06bd0',
    tagline: 'Animate layers with keyframes, effects and expressions.',
    description: 'An After Effects-style compositor: text, shapes and media layers with keyframes, graph editor, parenting, effects, blend modes and a few expressions.',
    features: [
      'Layers for text, shapes, solids, images and null objects, with parenting and blend modes',
      'Keyframes with easing curves, a graph editor and stopwatch rows for every property',
      'Expressions such as wiggle, loopOut, linear and smooth',
      'Effects: blur, glow, drop shadow, tint, adjust, pixelate and invert; animation presets',
      'Export a WebM video (real time) or a PNG-image-sequence ZIP; autosave',
      'Effects use the browser canvas filter, which Safari does not support; no .aep import',
    ],
  }),
  app({
    id: '3d', name: 'Techomato 3D Studio', category: 'Studio', color: '#ff9a3d',
    tagline: 'Model, light, animate and render 3D scenes.',
    description: 'A Blender-style 3D editor built on its own WebGL 2 renderer: add and edit meshes, apply modifiers, set up materials and lights, keyframe objects and render images or animation.',
    features: [
      'Primitives, lights (sun, point, spot), camera and empties with move/rotate/scale gizmos and G/R/S shortcuts',
      'Edit Mode with vertex, edge and face selection, extrude, inset, subdivide, merge and delete',
      'Modifiers: Subdivision Surface, Mirror, Array, Solidify, Twist and Displace',
      'Sculpt Mode with draw, inflate, smooth, grab, pinch and flatten brushes',
      'Materials with colour, metallic, roughness, emission and procedural patterns; solid, wireframe and rendered views with shadows',
      'Keyframe timeline with auto-key; render PNG stills or WebM animation; import/export OBJ and STL',
      'Real-time rasterizer (not a path tracer); shadows from one sun or spot light; does not open .blend files',
    ],
  }),

  /* ---------------- Utilities ---------------- */
  app({
    id: 'calculator', name: 'Techomato Calculator', category: 'Utilities', color: '#3d4457',
    tagline: 'Standard, scientific, graphing and programmer modes.',
    description: 'More than a calculator: plot functions, convert units and currencies, calculate dates and work in binary, octal and hex.',
    features: [
      'Standard and scientific modes with history and memory',
      'Graphing calculator for plotting functions',
      'Programmer mode: bin/oct/dec/hex and bitwise operations',
      'Date calculation and unit and currency converters',
      'Keyboard support and dark mode',
    ],
  }),
  app({
    id: 'clock', name: 'Techomato Clock', category: 'Utilities', color: '#5b3fc4',
    tagline: 'Focus sessions, timers, alarms and world time.',
    description: 'Stay on schedule with focus sessions, timers, a stopwatch, alarms and a world clock.',
    features: [
      'Focus sessions with breaks',
      'Named timers, a stopwatch with laps, repeating alarms with snooze',
      'World clock for cities around the world',
      'Alarms and timers ring only while the page is open in a browser tab',
    ],
  }),

  /* ---------------- More tools ---------------- */
  app({
    id: 'pdf', name: 'Techomato PDF Toolkit', category: 'Utilities', color: '#b3262b',
    tagline: 'Merge, split, edit and sign PDFs.',
    description: 'Work on PDF files privately in your browser. Nothing is uploaded. Combine, split, reorder, rotate, annotate, fill and export.',
    features: [
      'Merge, split, extract, reorder, rotate and delete pages with thumbnails',
      'Annotate: text, highlight, draw, shapes, images and signatures',
      'Add page numbers, watermarks and metadata; images to PDF and PDF to images',
      'Files are processed on your device and never leave the browser',
    ],
  }),

  app({
    id: 'whiteboard', name: 'Techomato Whiteboard', category: 'Creative', color: '#1f7a75',
    tagline: 'An infinite canvas to sketch and brainstorm.',
    description: 'Draw freehand, add shapes, sticky notes, text and connectors on a canvas that pans and zooms without limits.',
    features: [
      'Pen, highlighter, shapes, arrows, sticky notes, text and images',
      'Infinite pan and zoom, grid, layers order, grouping and alignment',
      'Undo/redo, autosave, export PNG/SVG or a board file',
    ],
  }),

  app({
    id: 'mindmap', name: 'Techomato Mind Maps', category: 'Creative', color: '#c2740f',
    tagline: 'Organise ideas as a mind map.',
    description: 'Fast, keyboard-driven mind maps with several layouts, colours, notes and exports.',
    features: [
      'Tab, Enter and arrow keys to build quickly; drag to re-parent topics',
      'Map, right, left and down layouts; themes, colours, notes and checkboxes',
      'Collapse branches, search, undo/redo',
      'Export PNG, SVG, Markdown, OPML or JSON; import from an outline or OPML',
    ],
  }),

  app({
    id: 'flow', name: 'Techomato Flowcharts', category: 'Creative', color: '#1b6f9e',
    tagline: 'Draw flowcharts and diagrams.',
    description: 'Drag shapes onto the canvas and connect them. Connectors follow shapes, and Auto layout tidies a diagram for you.',
    features: [
      'Flowchart shapes with orthogonal, curved or straight connectors',
      'Resize, align, distribute, group select, undo/redo and templates',
      'Auto layout; import and export Mermaid; export PNG, SVG or JSON',
    ],
  }),

  app({
    id: 'code', name: 'Techomato Code Playground', category: 'Developer', color: '#1f2937',
    tagline: 'Write HTML, CSS and JavaScript with a live preview.',
    description: 'An in-browser editor with syntax highlighting, a live sandboxed preview and a console.',
    features: [
      'HTML, CSS and JS editor with auto-pairing, indent, comment and format shortcuts',
      'Live preview in a sandbox, console with input, and device size presets',
      'Multiple files, templates and CDN libraries (these load from the network)',
      'Find/replace, import files, export a ZIP or a single HTML file',
    ],
  }),

  app({
    id: 'convert', name: 'Techomato Image Converter', category: 'Utilities', color: '#1a73c9',
    tagline: 'Convert, resize and compress images in bulk.',
    description: 'Convert many images at once between JPG, PNG, WebP, AVIF, BMP and ICO without uploading them.',
    features: [
      'Resize by size, percent or fit; crop to a ratio; rotate, flip, grayscale',
      'Quality slider or a target file size in KB; background fill for transparency',
      'Batch rename patterns, before/after compare, download all as a ZIP',
      'AVIF and WebP output depend on your browser',
    ],
  }),

  app({
    id: 'recorder', name: 'Techomato Recorder', category: 'Utilities', color: '#c42b32',
    tagline: 'Record your screen, camera or voice.',
    description: 'Capture the screen with an optional camera bubble, the camera alone, or audio only, then save it. Recordings stay on your device.',
    features: [
      'Screen, screen + camera, camera and voice modes with microphone and system audio',
      'Countdown, pause/resume, WebM or MP4 where the browser supports it',
      'Library of recordings with play, rename, download and delete',
      'Screen capture needs a desktop browser; recordings are stored in this browser only',
    ],
  }),

  app({
    id: 'vault', name: 'Techomato Vault', category: 'Utilities', color: '#3a42a8',
    tagline: 'A private, encrypted password manager.',
    description: 'Store logins, notes and cards encrypted with a master password. Everything stays in this browser.',
    features: [
      'AES-256-GCM encryption with a PBKDF2 key; the master password is never stored',
      'Password and passphrase generator, strength meter, one-time codes (TOTP)',
      'Audit for weak, reused and old passwords; tags and favourites',
      'Auto-lock, clipboard auto-clear, CSV import and encrypted backup. A lost master password cannot be recovered',
    ],
  }),

  app({
    id: 'writer', name: 'Techomato Writer', category: 'Productivity', color: '#2f3b49',
    tagline: 'Write in Markdown with a live preview.',
    description: 'A focused Markdown editor with split view, themes, outline and exports.',
    features: [
      'Split, write-only and preview views; toolbar and shortcuts',
      'Tables, task lists, code highlighting, outline and find/replace',
      'Focus mode, document library with templates',
      'Export Markdown, HTML or PDF (via print)',
    ],
  }),

  app({
    id: 'cards', name: 'Techomato Flashcards', category: 'Productivity', color: '#5f2fa8',
    tagline: 'Remember anything with spaced repetition.',
    description: 'Make decks of cards that come back just before you would forget them.',
    features: [
      'Spaced-repetition scheduling with learning steps and daily limits',
      'Basic and fill-in-the-blank cards, bulk add, CSV/TSV import and export',
      'Study, cram and multiple-choice quiz modes; type-the-answer and read aloud',
      'Progress: streak, 13-week heatmap, 7-day forecast and card maturity',
    ],
  }),

  /* ---------------- Coming soon ---------------- */
  {
    id: 'desktop-suite', name: 'Techomato Desktop Suite', category: 'Office', icon: '🖥️', color: '#1f3a5f',
    tagline: 'Docs, Sheets and Slides as a Windows app.',
    description: 'An installable Windows version of the office apps that works offline. Planned.',
    platforms: ['windows'], status: 'coming-soon',
    // Example once you have a real installer:
    // download: { url: './downloads/techomato-desktop-setup.exe', version: '1.0.0', size: '85 MB' },
    download: null,
    requirements: 'Windows 10 or later (64-bit).',
    features: ['Works offline', 'Opens local files', 'Auto-update'],
  },
];

const ORDER = ['Office', 'Productivity', 'Life', 'Creative', 'Studio', 'Utilities', 'Developer'];
export const categories = ['All', ...ORDER.filter((c) => software.some((s) => s.category === c))];
export const categoryOrder = ORDER;

export const getSoftware = (id) => software.find((s) => s.id === id);
