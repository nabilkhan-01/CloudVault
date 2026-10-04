import 'dotenv/config';

import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import session from 'express-session';
import multer from 'multer';

import {
  bucket,
  checkBucket,
  createDownloadUrl,
  deleteFile,
  listFiles,
  uploadFile,
} from './s3.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

const port = Number(process.env.PORT || 3000);
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB || 10);
const maxUploadBytes = maxUploadMb * 1024 * 1024;

const username = process.env.APP_USERNAME;
const password = process.env.APP_PASSWORD;
const sessionSecret = process.env.SESSION_SECRET;

if (!username || !password || !sessionSecret || sessionSecret.length < 32) {
  throw new Error('Set APP_USERNAME, APP_PASSWORD, and SESSION_SECRET (at least 32 characters) in .env.');
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}
if (!Number.isFinite(maxUploadMb) || maxUploadMb <= 0 || maxUploadMb > 100) {
  throw new Error('MAX_UPLOAD_MB must be greater than 0 and no more than 100.');
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxUploadBytes },
});

app.use(express.json({ limit: '16kb' }));
app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.COOKIE_SECURE === 'true',
      maxAge: 60 * 60 * 1000,
    },
  }),
);

function requireAuth(req, res, next) {
  if (req.session.authenticated) return next();
  return res.status(401).json({ error: 'Authentication required.' });
}

function safeKey(originalName) {
  const cleaned = path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g, '_');
  const id = crypto.randomUUID();
  return `uploads/${id}-${cleaned}`;
}

app.post('/api/login', (req, res) => {
  const { username: suppliedUser, password: suppliedPassword } = req.body ?? {};

  if (suppliedUser === username && suppliedPassword === password) {
    return req.session.regenerate((error) => {
      if (error) return res.status(500).json({ error: 'Unable to start a session.' });
      req.session.authenticated = true;
      return res.json({ ok: true });
    });
  }

  return res.status(401).json({ error: 'Invalid username or password.' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy((error) => {
    if (error) return res.status(500).json({ error: 'Unable to end the session.' });
    res.clearCookie('connect.sid');
    return res.json({ ok: true });
  });
});

app.get('/api/session', (req, res) => {
  res.json({ authenticated: Boolean(req.session.authenticated) });
});

app.get('/api/health', async (req, res) => {
  try {
    const info = await checkBucket();
    res.json({ ok: true, service: 'CloudVault', storage: info });
  } catch (error) {
    console.error('S3 health check failed:', error.name || 'AWS_ERROR');
    res.status(503).json({
      ok: false,
      error: 'Unable to access the configured S3 bucket.',
    });
  }
});

app.get('/api/files', requireAuth, async (req, res) => {
  try {
    res.json({ files: await listFiles() });
  } catch (error) {
    console.error('S3 list failed:', error.name || 'AWS_ERROR');
    res.status(500).json({ error: 'Unable to list files from S3.' });
  }
});

app.post('/api/files', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Select a file first.' });

    const key = safeKey(req.file.originalname);
    await uploadFile({
      key,
      body: req.file.buffer,
      contentType: req.file.mimetype,
    });

    res.status(201).json({
      message: 'File uploaded securely.',
      file: { key, originalName: req.file.originalname, size: req.file.size },
    });
  } catch (error) {
    console.error('S3 upload failed:', error.name || 'AWS_ERROR');
    res.status(500).json({ error: 'Unable to upload the file to S3.' });
  }
});

app.get('/api/files/download', requireAuth, async (req, res) => {
  try {
    const key = String(req.query.key || '');
    if (!isSafeKey(key)) {
      return res.status(400).json({ error: 'Invalid file key.' });
    }

    const url = await createDownloadUrl(key);
    return res.json({ url, expiresInSeconds: 300 });
  } catch (error) {
    console.error('S3 download URL generation failed:', error.name || 'AWS_ERROR');
    return res.status(500).json({ error: 'Unable to generate a download link.' });
  }
});

app.delete('/api/files', requireAuth, async (req, res) => {
  try {
    const key = String(req.query.key || '');
    if (!isSafeKey(key)) {
      return res.status(400).json({ error: 'Invalid file key.' });
    }

    await deleteFile(key);
    return res.json({ message: 'File deleted.' });
  } catch (error) {
    console.error('S3 delete failed:', error.name || 'AWS_ERROR');
    return res.status(500).json({ error: 'Unable to delete the file from S3.' });
  }
});

app.use(express.static(path.join(__dirname, '../public')));

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: error.message });
  }
  console.error('Request failed:', error.name || 'ERROR');
  return res.status(500).json({ error: 'Unexpected server error.' });
});

function isSafeKey(key) {
  return /^uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[a-zA-Z0-9._-]+$/.test(key);
}

app.listen(port, () => {
  console.log(`CloudVault running at http://localhost:${port}`);
  console.log(`Configured S3 bucket: ${bucket}`);
});
