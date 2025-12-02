import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Import des routes
import authRoutes from './routes/authRoutes.js';
import surveyRoutes from './routes/surveyRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
// import factCheckRoutes from './routes/factCheckRoutes.js'; // Correction nom doublon
import telegramRoutes from './routes/telegramRoutes.js';
import analysitRoutes from './routes/analysisRoutes.js';

// Import du controller Telegram pour le démarrage
import telegramBotController from './controllers/telegramController.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration Express
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Route de base
app.get('/', (req, res) => {
  res.json({ message: 'API Sondage - Serveur opérationnel' });
});

// Montage des routes
app.use('/api/auth', authRoutes);
app.use('/api/surveys', surveyRoutes);
app.use('/api/dashboard', dashboardRoutes);
// app.use('/api/fact-check', factCheckRoutes);
app.use('/api/telegram', telegramRoutes); // Important pour le Webhook
app.use('/api/analysis', analysitRoutes);

// Gestion globale des erreurs
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Une erreur est survenue sur le serveur' });
});

// Démarrage du serveur
app.listen(PORT, async () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);

  // ==========================================
  // INITIALISATION DU BOT TELEGRAM
  // ==========================================
  try {
    // Si on est en production (sur un serveur avec HTTPS), on utilise le Webhook
    if (process.env.NODE_ENV === 'production') {
      console.log('🌍 Mode Production détecté : Configuration du Webhook Telegram...');
      await telegramBotController.startWebhook();
    } 
    // Si on est en local, on utilise le Polling (plus simple pour tester)
    else {
      console.log('💻 Mode Développement détecté : Démarrage du Polling Telegram...');
      telegramBotController.startPolling();
    }
  } catch (error) {
    console.error('❌ Échec du démarrage du service Telegram:', error);
  }
});