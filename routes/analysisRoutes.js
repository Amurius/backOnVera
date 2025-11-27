import express from 'express';
import { 
  analyzeImage, 
  analyzeVideo, 
  analyzeText, 
  getOcrAnalyses, 
  getVideoAnalyses 
} from '../controllers/analysisController.js';

import upload from "../middlewares/upload.js";
import { uploadAndProcessVideo } from "../middlewares/upload.js";

const router = express.Router();

router.post('/ocr', upload.single('image'), analyzeImage);

// Pour la vidéo, on utilise ton middleware spécial de traitement
router.post('/video', uploadAndProcessVideo, analyzeVideo);

router.post('/text', analyzeText);

// Historiques
router.get('/ocr', getOcrAnalyses);
router.get('/video', getVideoAnalyses);

export default router;
