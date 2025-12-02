import express from 'express';
import telegramBotController from '../controllers/telegramController.js';

const router = express.Router();

// Route principale que Telegram appelle (Webhook)
router.post('/webhook', (req, res) => {
    telegramBotController.handleWebhook(req, res);
});

// Route pour vérifier l'état
router.get('/status', (req, res) => {
    res.json({ 
        online: telegramBotController.isRunning,
        mode: process.env.NODE_ENV === 'production' ? 'Webhook' : 'Polling'
    });
});

export default router;