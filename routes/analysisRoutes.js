
import express from 'express';
import {
  analyzeImage,
  analyzeVideo,
  analyzeText,
  getOcrAnalyses,
  getVideoAnalyses
} from '../controllers/analysisController.js';

import upload, { uploadVideo } from "../middlewares/upload.js";

const router = express.Router();

router.post('/ocr', upload.single('image'), analyzeImage);

// Pour la video, on envoie directement a Gemini
router.post('/video', uploadVideo, analyzeVideo);

router.post('/text', analyzeText);

// Historiques
router.get('/ocr', getOcrAnalyses);
router.get('/video', getVideoAnalyses);

export default router;
