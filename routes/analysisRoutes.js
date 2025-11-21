import express from 'express';
import multer from 'multer';
import path from 'path';
import { analyzeImage, analyzeVideo, analyzeText, getOcrAnalyses, getVideoAnalyses } from '../controllers/analysisController.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

router.post('/ocr', authMiddleware, upload.single('image'), analyzeImage);
router.post('/video', authMiddleware, upload.single('video'), analyzeVideo);
router.post('/text', authMiddleware, analyzeText);
router.get('/ocr', authMiddleware, getOcrAnalyses);
router.get('/video', authMiddleware, getVideoAnalyses);

export default router;
