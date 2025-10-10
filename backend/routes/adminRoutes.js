// backend/routes/adminRoutes.js
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { pool } from '../db.js';
import { pdfToMarkdown } from '../utils/pdfToMarkdown.js';

const router = express.Router();

// 🧩 Configure file upload path
const uploadDir = path.resolve('uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Always store PDFs under uploads root (no section folders)
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});

const upload = multer({ storage });

/* =====================================================
   📤 1️⃣ Upload Document
   ===================================================== */
// backend/routes/adminRoutes.js

router.post('/upload', upload.array('files', 10), async (req, res) => {
  try {
    const { section, description } = req.body;
    const files = req.files;

    if (!files || files.length === 0)
      return res.status(400).json({ error: 'No files uploaded' });

    const insertedFiles = [];

    for (const file of files) {
      const filePath = file.path;
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      const codeMap = {
        'Admin Guides': 'admin',
        'How-to Guides': 'howto',
        'Release Notes': 'release',
      };
      const code =
        codeMap[section] || section.toLowerCase().replace(/\s+/g, '');

      // 1️⃣ Insert into uploads
      // uploads table
      const { rows } = await pool.query(
        `INSERT INTO uploads (filename, section, code, filepath, file_size_mb, description)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (filename, section) DO UPDATE SET
         description = EXCLUDED.description,
         section = EXCLUDED.section,
         code = EXCLUDED.code,
         updated_at = NOW()
       RETURNING id;`,
        [
          file.originalname,
          section,
          code,
          filePath,
          fileSizeMB,
          description || null,
        ],
      );

      const uploadId = rows[0].id;

      // 2️⃣ Convert PDF → Markdown
      const mdFilename = file.originalname.replace(/\.pdf$/i, '.md');
      const mdDir = path.join(process.cwd(), 'converted', section);
      const mdPath = path.join(mdDir, mdFilename);

      if (!fs.existsSync(mdDir)) fs.mkdirSync(mdDir, { recursive: true });

      const markdown = await pdfToMarkdown(filePath);
      fs.writeFileSync(mdPath, markdown, 'utf8');

      // 3️⃣ Insert/Update converted_files table
      await pool.query(
        `INSERT INTO converted_files (upload_id, md_filename, md_path, code, conversion_status)
           VALUES ($1, $2, $3, $4, 'completed')
           ON CONFLICT (upload_id) DO UPDATE
             SET md_filename = EXCLUDED.md_filename,
                 md_path = EXCLUDED.md_path,
                 code = EXCLUDED.code,
                 conversion_status = 'completed',
                 converted_at = NOW();`,
        [uploadId, mdFilename, mdPath, code],
      );

      insertedFiles.push({
        filename: file.originalname,
        section,
        size: `${fileSizeMB} MB`,
      });
    }

    res.status(201).json({
      message: `✅ Uploaded & converted ${files.length} file(s) successfully`,
      files: insertedFiles,
    });
  } catch (err) {
    console.error('Upload Error:', err.message);
    res.status(500).json({ error: 'Failed to upload and convert document(s)' });
  }
});

/* =====================================================
   📋 2️⃣ List all uploaded documents
   ===================================================== */
router.get('/uploads', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, filename, section, description, uploaded_at, updated_at FROM uploads ORDER BY uploaded_at DESC',
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch uploads' });
  }
});

/* =====================================================
   ✏️ 3️⃣ Update metadata
   ===================================================== */
router.put('/update/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { description, section } = req.body;

    const result = await pool.query(
      `UPDATE uploads
       SET description = COALESCE($1, description),
           section = COALESCE($2, section),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [description, section, id],
    );

    if (result.rowCount === 0)
      return res.status(404).json({ error: 'Document not found' });

    res.json({ message: ' Updated successfully', data: result.rows[0] });
  } catch (err) {
    console.error(' Update Error:', err.message);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

/* =====================================================
   ❌ 4️⃣ Delete a document
   ===================================================== */
router.delete('/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM uploads WHERE id = $1 RETURNING filename, filepath',
      [id],
    );

    if (result.rowCount === 0)
      return res.status(404).json({ error: 'Document not found' });

    const filePath = result.rows[0].filepath;
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    res.json({ message: `Deleted ${result.rows[0].filename}` });
  } catch (err) {
    console.error('Delete Error:', err.message);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

export default router;
