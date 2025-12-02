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

// Appelé par Angular via: API_URL/chat/stream
router.post('/stream', streamChat);

// 2. Stream chat avec fichier (image/video)
router.post('/upload', upload.single('file'), streamChatFile);

// 3. Stream chat avec lien YouTube
router.post('/youtube', streamChatYouTube);

// 4. Historique des messages (authentification requise)
router.get('/history', verifyToken, getChatHistory);

// 5. Effacer l'historique (authentification requise)
router.delete('/history', verifyToken, clearChatHistory);

export default router;