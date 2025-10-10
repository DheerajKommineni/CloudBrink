import express from 'express';
import { pool } from '../db.js';

const router = express.Router();

// GET /api/downloads
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT os_name, version, download_url, description FROM downloads ORDER BY id ASC',
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching downloads:', err);
    res.status(500).json({ error: 'Failed to fetch downloads' });
  }
});

export default router;
