import express from 'express';
import { handleTikTokWebhook } from '../controllers/tiktokController.js';

const router = express.Router();

// Route publique
router.post('/webhook', handleTikTokWebhook);

export default router;