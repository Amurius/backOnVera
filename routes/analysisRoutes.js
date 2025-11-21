import express from 'express';
import path from 'path';
import { analyzeImage, analyzeVideo, analyzeText, getOcrAnalyses, getVideoAnalyses } from '../controllers/analysisController.js';
import { authMiddleware } from '../middlewares/auth.js';
import upload from "../middlewares/upload.js";
const router = express.Router();

router.post('/ocr', authMiddleware, upload.single('image'), analyzeImage);
router.post('/video', authMiddleware, upload.single('video'), analyzeVideo);
router.post('/text', authMiddleware, analyzeText);
router.get('/ocr', authMiddleware, getOcrAnalyses);
router.get('/video', authMiddleware, getVideoAnalyses);

export default router;
