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

  /* ---------------- Coming soon ---------------- */
  {
    id: 'whiteboard', name: 'Techomato Whiteboard', category: 'Creative', icon: '🧑‍🏫', color: '#2c7a7b',
    tagline: 'Sketch, diagram and brainstorm.',
    description: 'An infinite canvas for sketching and diagrams. Planned.',
    platforms: ['browser'], status: 'coming-soon',
    features: ['Freehand drawing', 'Shapes and connectors', 'Export as image'],
  },
  {
    id: 'pdf-toolkit', name: 'Techomato PDF Toolkit', category: 'Utilities', icon: '📄', color: '#c53030',
    tagline: 'Merge, split and reorder PDFs.',
    description: 'Work with PDF files locally, in the browser or as a Windows app. Planned.',
    platforms: ['browser', 'windows'], status: 'coming-soon', download: null,
    features: ['Merge and split', 'Reorder pages', 'Works offline on Windows'],
  },
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

const ORDER = ['Office', 'Productivity', 'Life', 'Creative', 'Studio', 'Utilities'];
export const categories = ['All', ...ORDER.filter((c) => software.some((s) => s.category === c))];
export const categoryOrder = ORDER;

export const getSoftware = (id) => software.find((s) => s.id === id);
