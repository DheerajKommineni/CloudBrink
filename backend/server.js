// backend/server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pdfToMarkdown } from './utils/pdfToMarkdown.js';
import { pool } from './db.js';
import adminRoutes from './routes/adminRoutes.js';
import downloadsRouter from './routes/downloads.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
const uploadsDir = path.join(__dirname, 'uploads');
const convertedDir = path.join(__dirname, 'converted');

if (!fs.existsSync(convertedDir))
  fs.mkdirSync(convertedDir, { recursive: true });

// Convert PDF → Markdown using the util
async function convertPdfToMarkdown(pdfPath, mdPath) {
  const markdown = await pdfToMarkdown(pdfPath);
  fs.writeFileSync(mdPath, markdown, 'utf8');
  console.log(
    `Converted: ${path.basename(pdfPath)} → ${path.basename(mdPath)}`,
  );
  return mdPath;
}

// Bulk conversion on startup
async function convertAllPdfs(uploadRoot, convertedRoot) {
  const sections = fs
    .readdirSync(uploadRoot)
    .filter(name => fs.statSync(path.join(uploadRoot, name)).isDirectory());

  for (const section of sections) {
    const sectionPath = path.join(uploadRoot, section);
    const outDir = path.join(convertedRoot, section);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const files = fs.readdirSync(sectionPath).filter(f => f.endsWith('.pdf'));

    for (const file of files) {
      const pdfPath = path.join(sectionPath, file);
      const mdPath = path.join(outDir, file.replace(/\.pdf$/i, '.md'));

      if (!fs.existsSync(mdPath)) {
        await convertPdfToMarkdown(pdfPath, mdPath);
        const { rows } = await pool.query(
          'SELECT id FROM uploads WHERE filename = $1',
          [file],
        );

        if (rows.length > 0) {
          const uploadId = rows[0].id;
          await saveConvertedFile(uploadId, path.basename(mdPath), mdPath);
        } else {
          console.warn(`⚠️ No upload record found for ${file}`);
        }
      } else {
        console.log(`Skipped (already exists): ${file}`);
      }
    }
  }
}

await convertAllPdfs(uploadsDir, convertedDir);

// Serve Markdown
// Serve Markdown using DB metadata
app.get('/api/docs/:code/:filename', async (req, res) => {
  try {
    const { code, filename } = req.params;
    const cleanFilename = filename.replace(/\.md$/i, '');

    console.log('Request:', { code, filename, cleanFilename }); // Debug

    const result = await pool.query(
      `SELECT c.md_path, c.code
         FROM converted_files c
         JOIN uploads u ON c.upload_id = u.id
         WHERE u.filename = $1 AND c.code = $2`,
      [`${cleanFilename}.pdf`, code],
    );

    console.log('Query result:', result.rows); // Debug

    if (result.rowCount === 0) {
      console.log('Document not found for:', { code, filename });
      return res.status(404).send('Document not found.');
    }

    const mdPath = result.rows[0].md_path;
    console.log('MD Path:', mdPath);

    if (!fs.existsSync(mdPath)) {
      console.log('File does not exist:', mdPath);
      return res.status(404).send('Markdown file missing.');
    }

    const content = fs.readFileSync(mdPath, 'utf8');
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.send(content);
  } catch (err) {
    console.error('💥 Markdown Error:', err.message);
    res.status(500).send('Failed to load Markdown file.');
  }
});

// Serve PDF for download
// Serve PDF for download (using DB path)
app.get('/api/download/:filename', async (req, res) => {
  try {
    const { filename } = req.params;

    const result = await pool.query(
      'SELECT filepath FROM uploads WHERE filename = $1',
      [filename],
    );

    if (result.rowCount === 0) {
      return res.status(404).send('File not found in database.');
    }

    const pdfPath = result.rows[0].filepath;
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).send('File missing on server.');
    }

    res.download(pdfPath, filename);
  } catch (err) {
    console.error('Download Error:', err.message);
    res.status(500).send('Failed to download file.');
  }
});

// Fixed Search Endpoint
// Search documents using converted_files table
app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q?.toLowerCase();
    if (!query || query.length < 2) return res.json([]);

    // Join with uploads table to get code
    const result = await pool.query(
      `SELECT c.md_filename, c.md_path, c.upload_id, u.code
         FROM converted_files c
         JOIN uploads u ON c.upload_id = u.id`,
    );

    const matches = [];
    for (const row of result.rows) {
      if (!fs.existsSync(row.md_path)) continue;
      const content = fs.readFileSync(row.md_path, 'utf8');
      const lower = content.toLowerCase();

      if (lower.includes(query)) {
        const index = lower.indexOf(query);
        const snippet = content
          .substring(Math.max(0, index - 80), index + 200)
          .replace(/\n+/g, ' ')
          .replace(/[#*_`]/g, '')
          .trim();

        matches.push({
          title: row.md_filename.replace(/\.md$/, '').replace(/_/g, ' '),
          snippet,
          file: row.md_filename,
          code: row.code,
        });
      }
    }

    res.json(matches.slice(0, 15));
  } catch (error) {
    console.error('Search Error:', error);
    res.status(500).json({ error: 'Failed to search documents' });
  }
});

// Get all available documents
app.get('/api/docs', async (req, res) => {
  try {
    const result = await pool.query(`
        SELECT u.id, u.filename, u.section, u.description, 
               u.code, u.filepath, c.md_filename, c.md_path, c.code as converted_code
        FROM uploads u
        LEFT JOIN converted_files c ON u.id = c.upload_id
        ORDER BY u.uploaded_at DESC;
      `);

    // Helper to map database keys to full section titles
    function getSectionTitle(sectionKey) {
      const titles = {
        admin: 'Admin Guides',
        howto: 'How-to Guides',
        release: 'Release Notes',
      };
      return titles[sectionKey?.toLowerCase()] || sectionKey || 'Miscellaneous';
    }

    // Group by code (not section)
    const grouped = {};
    result.rows.forEach(row => {
      const code = row.code || 'misc';
      if (!grouped[code]) grouped[code] = [];

      grouped[code].push({
        id: row.id,
        label: row.filename.replace(/\.pdf$/i, ''),
        description: row.description,
        file: row.filename,
        section: row.section,
        code: row.code,
        downloadUrl: `/api/download/${encodeURIComponent(row.filename)}`,
      });
    });

    // Use code as the key
    const formatted = Object.entries(grouped).map(([code, items]) => ({
      title: getSectionTitle(code),
      section: items[0]?.section,
      code: code,
      items,
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching docs:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// Save converted file path to DB
async function saveConvertedFile(uploadId, mdFilename, mdPath) {
  try {
    await pool.query(
      `INSERT INTO converted_files (upload_id, md_filename, md_path, conversion_status)
         VALUES ($1, $2, $3, 'completed')
         ON CONFLICT (upload_id) DO UPDATE
         SET md_filename = EXCLUDED.md_filename,
             md_path = EXCLUDED.md_path,
             conversion_status = 'completed',
             converted_at = NOW();`,
      [uploadId, mdFilename, mdPath],
    );
    console.log(`Saved converted file for upload_id=${uploadId}`);
  } catch (err) {
    console.error('DB insert error for converted_files:', err.message);
  }
}

app.use('/api/admin', adminRoutes);
app.use('/api/downloads', downloadsRouter);

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
