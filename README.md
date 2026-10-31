# Ready-Writer starter application

A runnable full-stack starter inspired by the supplied mobile screenshot. It accepts manuscript text and metadata, detects chapter headings, optionally performs conservative typographic cleanup, and exports DOCX, print-interior PDF, or reflowable EPUB.

## Run locally

1. Install Node.js 18 or newer.
2. In this folder run `npm install`.
3. Run `npm start`.
4. Open `http://localhost:3000`.

## API

- `POST /api/preview` — validates the form and returns parsed chapter structure and word count.
- `POST /api/build` — generates the selected `docx`, `pdf`, or `epub` file and streams it as a download.

## Important production notes

This is an MVP foundation, not a guarantee of Amazon KDP acceptance. Before commercial use, add authentication, persistent project storage, background jobs, upload limits, malware scanning, rate limiting, error monitoring, and automated document QA. The current auto-edit is rule-based cleanup, not substantive developmental or copy editing; it can alter text, so retain the original manuscript and require author review. The cover theme selector is UI-only in this starter: a complete KDP paperback cover needs a separately calculated full-wrap template based on final page count, paper type, trim size, and bleed. The PDF generated here is an interior proof, not a full cover wrap. The current contents page is a simple chapter list; production pagination and clickable EPUB navigation should be improved before release. Add user-supplied images and image placement logic before advertising picture-book support.

## Suggested production architecture

- Frontend: Next.js/React form, manuscript editor, preview and project dashboard.
- API: Node/Express or Next.js route handlers; validate inputs with Zod.
- Queue: Redis + BullMQ for large document jobs.
- Storage: S3-compatible object storage for originals and generated files.
- Database: PostgreSQL for users, projects, versions, job state, and export history.
- Document pipeline: normalize manuscript → parse structure → edit suggestions → style/layout → generate DOCX/PDF/EPUB → validate outputs → downloadable package.
- AI editing: separate opt-in stages for proofreading, line editing, and developmental feedback; never silently rewrite the author's manuscript.


### Uploading a manuscript
In the Manuscript section, choose a plain-text `.txt` file using the upload control. The browser reads the file locally and places its contents in the editable manuscript box; the file itself is not sent as a separate upload. You can review or edit the text before generating the document. Files are limited to 10 MB.


### Manuscript uploads

- `.txt` and `.docx` files are supported.
- Maximum upload size: 10 MB.
- DOCX text and paragraph breaks are extracted on the server using Mammoth.
- Imported content is placed in the manuscript editor so authors can review and edit it before export.
- DOCX images, headers, footers, comments, tracked changes and advanced page layout are not imported.

Install the updated dependencies with `npm install`, then start the app with `npm start`.
