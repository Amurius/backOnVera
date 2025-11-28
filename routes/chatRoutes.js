import express from 'express';
import {
  streamChat,
  streamChatFile,
  streamChatYouTube,
  getChatHistory,
  clearChatHistory
} from '../controllers/chatController.js';
import upload from '../middlewares/upload.js';
import { verifyToken } from '../middlewares/auth.js';

const router = express.Router();

// Stream chat avec texte
router.post('/stream', streamChat);

// Stream chat avec fichier (image/video)
router.post('/stream-file', upload.single('file'), streamChatFile);

// Stream chat avec lien YouTube
router.post('/stream-youtube', streamChatYouTube);

// Historique des messages (authentification requise)
router.get('/history', verifyToken, getChatHistory);

// Effacer l'historique (authentification requise)
router.delete('/history', verifyToken, clearChatHistory);

export default router;
