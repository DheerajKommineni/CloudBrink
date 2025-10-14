// backend/routes/adminRoutes.js
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { pool } from '../db.js';
import { pdfToMarkdown } from '../utils/pdfToMarkdown.js';

const router = express.Router();

const uploadDir = path.resolve('uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});

const upload = multer({ storage });

/**
 * Background conversion helper (non-blocking)
 */
async function convertPdfInBackground(
  uploadId,
  filePath,
  section,
  filename,
  code,
) {
  try {
    const mdFilename = filename.replace(/\.pdf$/i, '.md');
    const mdDir = path.join(process.cwd(), 'converted', section);
    const mdPath = path.join(mdDir, mdFilename);

    if (!fs.existsSync(mdDir)) {
      fs.mkdirSync(mdDir, { recursive: true });
    }

    console.log(`Converting PDF: ${filename}`);

    const outputDir = path.resolve('uploads');
    const markdown = await pdfToMarkdown(filePath, outputDir);
    fs.writeFileSync(mdPath, markdown, 'utf8');

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

    console.log(`Conversion complete: ${filename}`);
  } catch (err) {
    console.error(`Conversion failed for ${filename}:`, err.message);

    await pool.query(
      `INSERT INTO converted_files (upload_id, md_filename, md_path, code, conversion_status)
       VALUES ($1, '', '', $2, 'failed')
       ON CONFLICT (upload_id) DO UPDATE
       SET conversion_status = 'failed'`,
      [uploadId, code],
    );
  }
}

/* =====================================================
   Upload Document (with background conversion)
   ===================================================== */
router.post('/upload', upload.array('files', 10), async (req, res) => {
  try {
    const { section, description } = req.body;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const insertedFiles = [];
    const codeMap = {
      'Admin Guides': 'admin',
      'How-to Guides': 'howto',
      'Release Notes': 'release',
    };
    const code = codeMap[section] || section.toLowerCase().replace(/\s+/g, '');

    for (const file of files) {
      const filePath = file.path;
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);

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

      // Convert in background (non-blocking)
      convertPdfInBackground(
        uploadId,
        filePath,
        section,
        file.originalname,
        code,
      );

      insertedFiles.push({
        filename: file.originalname,
        section,
        size: `${fileSizeMB} MB`,
        uploadId,
      });
    }

    res.status(201).json({
      message: `Uploaded ${files.length} file(s). Conversion in progress.`,
      files: insertedFiles,
    });
  } catch (err) {
    console.error('Upload Error:', err.message);
    res.status(500).json({ error: 'Failed to upload document(s)' });
  }
});

/* =====================================================
   Get conversion status
   ===================================================== */
router.get('/conversion-status/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;

    const result = await pool.query(
      'SELECT conversion_status, converted_at FROM converted_files WHERE upload_id = $1',
      [uploadId],
    );

    if (result.rowCount === 0) {
      return res.json({ status: 'pending' });
    }

    res.json({
      status: result.rows[0].conversion_status,
      convertedAt: result.rows[0].converted_at,
    });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Failed to check conversion status' });
  }
});

/* =====================================================
   List all uploaded documents
   ===================================================== */
router.get('/uploads', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.filename, u.section, u.description, 
             u.uploaded_at, u.updated_at,
             c.conversion_status, c.converted_at
      FROM uploads u
      LEFT JOIN converted_files c ON u.id = c.upload_id
      ORDER BY u.uploaded_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch uploads' });
  }
});

/* =====================================================
   Update metadata
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

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json({ message: 'Updated successfully', data: result.rows[0] });
  } catch (err) {
    console.error('Update Error:', err.message);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

/* =====================================================
   Delete a document
   ===================================================== */
router.delete('/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT filename, filepath FROM uploads WHERE id = $1',
      [id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const { filename, filepath } = result.rows[0];

    // Delete from database
    await pool.query('DELETE FROM converted_files WHERE upload_id = $1', [id]);
    await pool.query('DELETE FROM uploads WHERE id = $1', [id]);

    // Delete PDF file
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }

    // Delete markdown file
    const baseName = filename.replace(/\.pdf$/i, '');
    const sections = ['Admin Guides', 'How-to Guides', 'Release Notes'];
    for (const section of sections) {
      const mdPath = path.join(
        process.cwd(),
        'converted',
        section,
        `${baseName}.md`,
      );
      if (fs.existsSync(mdPath)) {
        fs.unlinkSync(mdPath);
      }
    }

    // Delete associated images
    const imageDir = path.join(process.cwd(), 'uploads', 'images', baseName);
    if (fs.existsSync(imageDir)) {
      fs.rmSync(imageDir, { recursive: true });
    }

    res.json({ message: `Deleted ${filename}` });
  } catch (err) {
    console.error('Delete Error:', err.message);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

export default router;
