const express = require('express');
const router = express.Router();
const telegramController = require('../controllers/telegramController');

// Route pour gérer les webhooks Telegram
router.post('/webhook', (req, res) => {
    return telegramController.getWebhookMiddleware()(req, res);
});

// Route de test pour vérifier que le serveur fonctionne
router.get("/status", (req, res) => {
    res.json({ status: "Telegram webhook actif" });
});

module.exports = router;