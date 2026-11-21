/*
  The Techomato software catalog. To add a new product, add an object to this array.

  Fields
  - id          unique slug, used in URLs (#/software/<id>). For browser apps it is also the AppLogo id
                (src/components/AppLogo.jsx) and the route (/app/<id>).
  - platforms   ['browser']
  - status      'available' | 'coming-soon'
  - launch      route of a browser app (e.g. '/app/pdf'), only for status 'available'
  - url         external web app hosted elsewhere (opens in a new tab); use instead of launch
  - icon        emoji shown for products that have no AppLogo yet (coming-soon items)
*/
const BROWSER = 'Any modern browser (Chrome, Edge, Firefox, Safari).';
const app = (o) => ({ platforms: ['browser'], status: 'available', launch: `/app/${o.id}`, version: '1.0', requirements: BROWSER, ...o });

export const software = [


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



  /* ---------------- Hosted separately (promoted in its own landing-page section, not in the app grid) ---------------- */
  {
    id: 'colleges', name: 'Techomato Colleges', category: 'Business', icon: '🎓', color: '#0f766e',
    tagline: 'One platform to run your entire college.',
    description: 'Techomato Colleges brings admissions, academics, fees, examinations and staff management into a single secure platform, with dedicated access for administrators, faculty and students. It is a standalone product with its own sign-in.',
    platforms: ['browser'], status: 'available', url: 'https://colleges.techomato.com',
    version: '1.0', requirements: BROWSER,
    // Landing-page tiles: [title, one-line description, 24x24 stroke-icon path]. Confirm these match the product.
    highlights: [
      ['Admissions', 'Applications, enrolment and student records.', 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6'],
      ['Academics', 'Courses, timetables and attendance.', 'M22 10 12 5 2 10l10 5 10-5zM6 12v5c3 2 9 2 12 0v-5'],
      ['Fees', 'Fee structures, payments and receipts.', 'M2 6h20v12H2zM2 10h20M6 15h4'],
      ['Examinations', 'Schedules, marks and results.', 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M9 14l2 2 4-4'],
      ['Staff', 'Faculty profiles, roles and access.', 'M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3z'],
      ['Reports', 'Dashboards and exports for management.', 'M3 3v18h18M7 15l4-4 3 3 5-6'],
    ],
    features: ['Admissions and student records', 'Academics, timetables and attendance', 'Fees, payments and receipts', 'Examinations and results', 'Staff and role-based access', 'Reports and dashboards'],
  },
];

const ORDER = ['Office', 'Productivity', 'Life', 'Creative', 'Studio', 'Utilities', 'Developer'];
export const categories = ['All', ...ORDER.filter((c) => software.some((s) => s.category === c))];
export const categoryOrder = ORDER;

export const getSoftware = (id) => software.find((s) => s.id === id);
