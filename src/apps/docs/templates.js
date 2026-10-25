// Starter documents. Each returns the data object stored for a Docs file.
const tidy = (h) => h.replace(/>\s*\n\s*</g, '><').trim();
const base = (html, page) => () => ({ html: tidy(html), page });

export const DOC_TEMPLATES = [
  {
    name: 'Meeting notes',
    make: base(`<h1>Meeting notes</h1>
<p><b>Date:</b> &nbsp;&nbsp; <b>Time:</b> &nbsp;&nbsp; <b>Location:</b></p>
<p><b>Attendees:</b></p>
<h2>Agenda</h2>
<ol><li>Topic one</li><li>Topic two</li><li>Topic three</li></ol>
<h2>Discussion</h2>
<p>Write the key points here.</p>
<h2>Decisions</h2>
<ul><li>Decision and owner</li></ul>
<h2>Action items</h2>
<ul class="checklist"><li data-done="false">Action - owner - due date</li><li data-done="false">Action - owner - due date</li></ul>`),
  },
  {
    name: 'Project proposal',
    make: base(`<p class="doc-title">Project proposal</p>
<p class="doc-subtitle">Prepared for [Client] by [Your name] - [Date]</p>
<h1>Summary</h1>
<p>Describe the problem and the proposed solution in two or three sentences.</p>
<h1>Goals</h1>
<ul><li>Goal one</li><li>Goal two</li><li>Goal three</li></ul>
<h1>Scope and deliverables</h1>
<table class="doctable"><tbody><tr><th>Deliverable</th><th>Description</th><th>Due</th></tr><tr><td><br></td><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td><td><br></td></tr></tbody></table><p><br></p>
<h1>Timeline</h1>
<p>Outline the main milestones.</p>
<h1>Budget</h1>
<table class="doctable"><tbody><tr><th>Item</th><th>Cost</th></tr><tr><td>Design</td><td><br></td></tr><tr><td>Development</td><td><br></td></tr><tr><td><b>Total</b></td><td><br></td></tr></tbody></table><p><br></p>
<h1>Next steps</h1>
<p>What should the reader do to approve this proposal?</p>`),
  },
  {
    name: 'Resume',
    make: base(`<h1 style="text-align:center">Your Name</h1>
<p style="text-align:center">City, Country - +00 000 000 0000 - you@example.com - linkedin.com/in/you</p>
<h2>Summary</h2>
<p>Two or three lines about your experience and what you are looking for.</p>
<h2>Experience</h2>
<p><b>Job title</b>, Company <span style="float:right">2022 - Present</span></p>
<ul><li>Achievement with a measurable result</li><li>Responsibility or project you led</li></ul>
<p><b>Job title</b>, Company <span style="float:right">2019 - 2022</span></p>
<ul><li>Achievement with a measurable result</li></ul>
<h2>Education</h2>
<p><b>Degree</b>, University <span style="float:right">2015 - 2019</span></p>
<h2>Skills</h2>
<p>Skill one - Skill two - Skill three - Skill four</p>`, { size: 'a4', orient: 'portrait', margins: { t: 0.7, r: 0.8, b: 0.7, l: 0.8 }, cols: 1, bg: '#ffffff', header: '', footer: '', numbers: 'none' }),
  },
  {
    name: 'Cover letter',
    make: base(`<p>[Your name]<br>[Address]<br>[Email] - [Phone]</p>
<p>[Date]</p>
<p>[Hiring manager's name]<br>[Company]<br>[Address]</p>
<p>Dear [Name],</p>
<p>Open with the role you are applying for and one sentence about why you are a strong fit.</p>
<p>In the middle paragraph, connect two or three of your achievements to what the company needs.</p>
<p>Close by thanking the reader and saying how you will follow up.</p>
<p>Sincerely,<br><br>[Your name]</p>`),
  },
  {
    name: 'Weekly report',
    make: base(`<h1>Weekly report</h1>
<p><b>Week of:</b> &nbsp; <b>Prepared by:</b></p>
<h2>Highlights</h2>
<ul><li>What went well</li></ul>
<h2>Progress against goals</h2>
<table class="doctable"><tbody><tr><th>Goal</th><th>Status</th><th>Notes</th></tr><tr><td><br></td><td><br></td><td><br></td></tr></tbody></table><p><br></p>
<h2>Blockers</h2>
<ul><li>Blocker and what you need</li></ul>
<h2>Plan for next week</h2>
<ul class="checklist"><li data-done="false">Priority one</li><li data-done="false">Priority two</li></ul>`),
  },
  {
    name: 'Invoice',
    make: base(`<h1>Invoice</h1>
<p><b>Invoice no:</b> 0001 &nbsp;&nbsp; <b>Date:</b> &nbsp;&nbsp; <b>Due:</b></p>
<p><b>From:</b><br>Your business name<br>Address</p>
<p><b>Bill to:</b><br>Client name<br>Address</p>
<table class="doctable"><tbody><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr><tr><td><br></td><td><br></td><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td><td><br></td><td><br></td></tr><tr><td colspan="3" style="text-align:right"><b>Total</b></td><td><br></td></tr></tbody></table>
<p><br></p><p>Payment details and terms.</p>`),
  },
  {
    name: 'Study notes',
    make: base(`<h1>Topic title</h1>
<p><i>Course - Date</i></p>
<h2>Key ideas</h2>
<ul><li>Idea one</li><li>Idea two</li></ul>
<h2>Definitions</h2>
<table class="doctable"><tbody><tr><th>Term</th><th>Meaning</th></tr><tr><td><br></td><td><br></td></tr></tbody></table><p><br></p>
<h2>Questions to review</h2>
<ul class="checklist"><li data-done="false">Question one</li></ul>`),
  },
];

export const DEFAULT_PAGE = { size: 'letter', orient: 'portrait', margins: { t: 1, r: 1, b: 1, l: 1 }, cols: 1, bg: '#ffffff', header: '', footer: '', numbers: 'none' };

export const PAGE_SIZES = {
  letter: { w: 8.5, h: 11, label: 'Letter (8.5 x 11 in)' },
  a4: { w: 8.27, h: 11.69, label: 'A4 (210 x 297 mm)' },
  legal: { w: 8.5, h: 14, label: 'Legal (8.5 x 14 in)' },
  a5: { w: 5.83, h: 8.27, label: 'A5 (148 x 210 mm)' },
  a3: { w: 11.69, h: 16.54, label: 'A3 (297 x 420 mm)' },
};
