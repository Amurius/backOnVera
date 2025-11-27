import express from 'express';
import multer from 'multer';
import { checkText, checkImage, checkVideo } from '../controllers/factCheckController.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

router.post('/text', checkText);
router.post('/image', upload.single('image'), checkImage);
router.post('/video', upload.single('video'), checkVideo);

export default router;
