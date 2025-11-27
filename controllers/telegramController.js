import express from 'express';
import telegramController from '../controllers/telegramController.js';

const router = express.Router();

// Route webhook - C'EST LA ROUTE PRINCIPALE
router.post('/webhook', telegramController.getWebhookCallback());

// Route pour configurer le webhook (à appeler une seule fois après déploiement)
router.post('/set-webhook', async (req, res) => {
  try {
    const webhookUrl = `${process.env.WEBHOOK_DOMAIN}/api/telegram/webhook`;
    const result = await telegramController.setWebhook(webhookUrl);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Route pour vérifier le statut du webhook
router.get('/webhook-info', async (req, res) => {
  try {
    const info = await telegramController.getWebhookInfo();
    res.json({
      success: true,
      webhook: info
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Route de test
router.get('/status', (req, res) => {
  res.json({
    success: true,
    message: 'Bot Telegram webhook actif'
  });
});

export default router;