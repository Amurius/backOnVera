import express from 'express';
import { checkText, checkImage, checkVideo } from '../controllers/factCheckController.js';

// 1. SÉCURITÉ : On protège ces routes avec ton Token
import { verifyToken } from '../middlewares/auth.js';

// 2. UPLOAD : On réutilise ton middleware centralisé (plus propre)
import upload from '../middlewares/upload.js';

const router = express.Router();

// Route Texte (Protégée)
router.post('/text', verifyToken, checkText);

// Route Image (Protégée + Upload)
router.post('/image', verifyToken, upload.single('image'), checkImage);

// Route Vidéo (Protégée + Upload)
router.post('/video', verifyToken, upload.single('video'), checkVideo);

export default router;