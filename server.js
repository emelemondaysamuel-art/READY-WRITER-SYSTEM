const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak } = require('docx');
const PDFDocument = require('pdfkit');
const epub = require('epub-gen');
const multer = require('multer');
const mammoth = require('mammoth');

const app = express();
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase();
    if (name.endsWith('.txt') || name.endsWith('.docx')) return cb(null, true);
    cb(new Error('Only .txt and .docx manuscript files are supported.'));
  }
});

// Import plain-text and Word manuscripts into the browser editor.
app.post('/api/upload', (req, res) => {
  upload.single('manuscript')(req, res, async err => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'The manuscript is too large. Maximum upload size is 10 MB.' : err.message });
    try {
      if (!req.file) return res.status(400).json({ error: 'Choose a .txt or .docx file to upload.' });
      const name = req.file.originalname.toLowerCase();
      let text;
      if (name.endsWith('.txt')) {
        text = req.file.buffer.toString('utf8').replace(/^\uFEFF/, '');
      } else {
        const result = await mammoth.extractRawText({ buffer: req.file.buffer });
        text = result.value || '';
      }
      text = text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
      if (!text) return res.status(400).json({ error: 'No readable text was found in this file.' });
      res.json({ text, filename: req.file.originalname, characters: text.length });
    } catch (e) {
      res.status(400).json({ error: 'Could not extract text from this file. Make sure the .docx file is valid and not password-protected.' });
    }
  });
});

const TRIMS = {
  '5x8': [360, 576], '5.5x8.5': [396, 612], '6x9': [432, 648], '8.5x11': [612, 792]
};

function cleanText(s = '') {
  return String(s).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}
function smartEdit(text) {
  return cleanText(text)
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,.;:!?])(?=[A-Za-z])/g, '$1 ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\b([\w']+)(\s+)\1\b/gi, '$1')
    .replace(/-\n(?=[a-z])/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
function parseChapters(raw, autoEdit) {
  const text = autoEdit ? smartEdit(raw) : cleanText(raw).trim();
  const lines = text.split('\n');
  const chapters = [];
  let current = null;
  const heading = /^(chapter\s+\d+\b.*|#\s+.+|part\s+[ivx0-9]+\b.*)$/i;
  for (const line of lines) {
    if (heading.test(line.trim())) {
      if (current) chapters.push(current);
      current = { title: line.trim().replace(/^#\s*/, ''), body: [] };
    } else {
      if (!current) current = { title: 'Introduction', body: [] };
      current.body.push(line);
    }
  }
  if (current) chapters.push(current);
  return chapters.map(c => ({ title: c.title, body: c.body.join('\n').trim() })).filter(c => c.title || c.body);
}
function validate(data) {
  if (!data.title?.trim()) throw new Error('Please enter a book title.');
  if (!data.author?.trim()) throw new Error('Please enter the author name.');
  if (!data.manuscript?.trim()) throw new Error('Paste your manuscript before building the book.');
  if (!TRIMS[data.trim]) throw new Error('Select a supported trim size.');
}
function metadataPages(data, chapters) {
  const pages = [];
  if (data.dedication?.trim()) pages.push({ title: 'Dedication', content: data.dedication.trim() });
  if (data.copyrightPage) pages.push({ title: 'Copyright', content: `Copyright © ${new Date().getFullYear()} ${data.author}. All rights reserved.\n\nNo part of this publication may be reproduced, distributed, or transmitted in any form without prior written permission of the author, except for brief quotations in reviews and other permitted uses under copyright law.` });
  if (data.toc) pages.push({ title: 'Contents', content: chapters.map(c => c.title).join('\n') });
  return pages;
}

app.post('/api/preview', (req, res) => {
  try {
    const d = req.body; validate(d);
    const chapters = parseChapters(d.manuscript, d.autoEdit);
    res.json({ title: d.title, author: d.author, chapters, wordCount: (d.manuscript.trim().match(/\S+/g) || []).length, chapterCount: chapters.length });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/build', async (req, res) => {
  let tempDir;
  try {
    const d = req.body; validate(d);
    const chapters = parseChapters(d.manuscript, d.autoEdit);
    const frontMatter = metadataPages(d, chapters);
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ready-writer-'));
    const outputs = [];

    // DOCX: editable manuscript with title page, front matter and chapter headings.
    const docChildren = [
      new Paragraph({ text: d.title, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing: { after: 300 } }),
      new Paragraph({ text: `By ${d.author}`, alignment: AlignmentType.CENTER }),
      new Paragraph({ children: [new PageBreak()] })
    ];
    for (const page of frontMatter) {
      docChildren.push(new Paragraph({ text: page.title, heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
      page.content.split('\n').forEach(line => docChildren.push(new Paragraph({ text: line })));
    }
    for (const c of chapters) {
      docChildren.push(new Paragraph({ text: c.title, heading: HeadingLevel.HEADING_1, pageBreakBefore: true, spacing: { after: 240 } }));
      (c.body || '').split(/\n\s*\n/).forEach(p => { if (p.trim()) docChildren.push(new Paragraph({ children: [new TextRun(p.trim())], spacing: { after: 180, line: 360 } })); });
    }
    if (d.aboutAuthor?.trim()) {
      docChildren.push(new Paragraph({ text: 'About the Author', heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
      docChildren.push(new Paragraph({ text: d.aboutAuthor.trim() }));
    }
    const doc = new Document({ sections: [{ properties: { page: { size: { width: TRIMS[d.trim][0] * 20, height: TRIMS[d.trim][1] * 20 }, margin: { top: 72 * 20, bottom: 72 * 20, left: (d.mirror ? 90 : 72) * 20, right: 72 * 20, gutter: (d.mirror ? 18 : 0) * 20 } } }, children: docChildren }] });
    const docxPath = path.join(tempDir, 'book.docx');
    fs.writeFileSync(docxPath, await Packer.toBuffer(doc));
    outputs.push({ path: docxPath, name: `${slug(d.title)}.docx`, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

    // PDF: print-oriented interior. KDP cover wrap is intentionally a separate production step.
    const [w, h] = TRIMS[d.trim];
    const pdfPath = path.join(tempDir, 'book.pdf');
    await new Promise((resolve, reject) => {
      const pdf = new PDFDocument({ size: [w, h], margins: { top: 58, bottom: 58, left: d.mirror ? 72 : 58, right: 58 }, bufferPages: true, autoFirstPage: true });
      const out = fs.createWriteStream(pdfPath); pdf.pipe(out); out.on('finish', resolve); out.on('error', reject);
      const font = d.font === 'Sans' ? 'Helvetica' : d.font === 'Classic' ? 'Times-Roman' : 'Times-Roman';
      pdf.font('Times-Bold').fontSize(24).text(d.title, 60, h * 0.34, { width: w - 120, align: 'center' });
      pdf.moveDown(2).font('Times-Roman').fontSize(13).text(`By ${d.author}`, { align: 'center' });
      for (const page of frontMatter) {
        pdf.addPage(); pdf.font('Times-Bold').fontSize(18).text(page.title, { align: 'center' }); pdf.moveDown(2).font(font).fontSize(11).text(page.content, { align: page.title === 'Dedication' ? 'center' : 'left', lineGap: 4 });
      }
      for (const c of chapters) {
        pdf.addPage(); pdf.font('Times-Bold').fontSize(18).text(c.title, { align: 'center' }); pdf.moveDown(1.5).font(font).fontSize(11).text(c.body || '', { align: 'left', lineGap: 4, paragraphGap: 8 });
      }
      if (d.aboutAuthor?.trim()) { pdf.addPage(); pdf.font('Times-Bold').fontSize(18).text('About the Author', { align: 'center' }); pdf.moveDown().font(font).fontSize(11).text(d.aboutAuthor); }
      pdf.end();
    });
    outputs.push({ path: pdfPath, name: `${slug(d.title)}-interior.pdf`, type: 'application/pdf' });

    // EPUB: reflowable ebook; print trim size and mirrored margins do not apply.
    const epubPath = path.join(tempDir, 'book.epub');
    const epubContent = [];
    for (const p of frontMatter) epubContent.push({ title: p.title, data: `<p>${escapeHtml(p.content).replace(/\n/g, '<br/>')}</p>` });
    for (const c of chapters) epubContent.push({ title: c.title, data: `<div>${escapeHtml(c.body).split(/\n\s*\n/).map(x => `<p>${x.replace(/\n/g, '<br/>')}</p>`).join('')}</div>` });
    if (d.aboutAuthor?.trim()) epubContent.push({ title: 'About the Author', data: `<p>${escapeHtml(d.aboutAuthor)}</p>` });
    await new epub({ title: d.title, author: d.author, publisher: d.publisher || d.author, lang: 'en', content: epubContent }, epubPath).promise;
    outputs.push({ path: epubPath, name: `${slug(d.title)}.epub`, type: 'application/epub+zip' });

    // Return one generated file at a time; frontend requests each format separately.
    const requested = d.output || 'docx';
    const selected = outputs.find(o => requested === 'pdf' ? o.name.endsWith('.pdf') : requested === 'epub' ? o.name.endsWith('.epub') : o.name.endsWith('.docx'));
    res.download(selected.path, selected.name, () => { try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} });
  } catch (e) {
    if (tempDir) try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    res.status(400).json({ error: e.message || 'Could not build the document.' });
  }
});
function slug(s) { return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'book'; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Ready-Writer running at http://localhost:${PORT}`));
