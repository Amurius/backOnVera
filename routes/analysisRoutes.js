import express from 'express';
import { 
  analyzeImage, 
  analyzeVideo, 
  analyzeText, 
  getOcrAnalyses, 
  getVideoAnalyses 
} from '../controllers/analysisController.js';

// 👇 CORRECTION IMPORTANTE : On utilise le bon nom 'verifyToken'
import { verifyToken } from '../middlewares/auth.js';

import upload from "../middlewares/upload.js";
import { uploadAndProcessVideo } from "../middlewares/upload.js";

const router = express.Router();

// Routes protégées par le Token + Upload Fichier
router.post('/ocr', verifyToken, upload.single('image'), analyzeImage);

// Pour la vidéo, on utilise ton middleware spécial de traitement
router.post('/video', verifyToken, uploadAndProcessVideo, analyzeVideo);

router.post('/text', verifyToken, analyzeText);

// Historiques
router.get('/ocr', verifyToken, getOcrAnalyses);
router.get('/video', verifyToken, getVideoAnalyses);

export default router;