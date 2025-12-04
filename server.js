import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Import des routes
import authRoutes from './routes/authRoutes.js';
import surveyRoutes from './routes/surveyRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import telegramRoutes from './routes/telegramRoutes.js';
import analysisRoutes from './routes/analysisRoutes.js';

// Import du controller Telegram pour le démarrage
import telegramBotController from './controllers/telegramController.js';
import tiktokRoutes from './routes/tiktokRoutes.js'; // <--- 1. Est-ce que cette ligne est là ?
import chatRoutes from './routes/chatRoutes.js';
import clusteringRoutes from './routes/clusteringRoutes.js';
import { preloadModel } from './services/nlpService.js';
import { validateConfig } from './services/clusteringConfig.js';

dotenv.config();

// Valide la configuration du clustering au demarrage
try {
    validateConfig();
} catch (error) {
    console.error('Erreur de configuration:', error.message);
    process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

// 👇 CONFIGURATION CORS MISE À JOUR 👇
// Accepte le port 4200 (Angular standard) ET ton port actuel 63420
app.use(cors({
  origin: function (origin, callback) {
    // Autorise les requêtes sans origine (ex: curl, mobile apps)
    if (!origin) return callback(null, true);
    
    // Autorise n'importe quel localhost (4200, 63420, etc.)
    if (origin.startsWith('http://localhost') || origin.startsWith('https://front-on-vera.vercel.app') || origin.startsWith('http://104.199.39.44')) {
      return callback(null, true);
    }
    
    // Bloque le reste
    callback(new Error('Non autorisé par CORS'));
  },
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Route de base
app.get('/', (req, res) => {
  res.json({ message: 'API Sondage - Serveur opérationnel' });
});

// Déclaration des Routes
app.use('/api/auth', authRoutes);
app.use('/api/surveys', surveyRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/tiktok', tiktokRoutes);
app.use('/api/telegram', telegramRoutes); // Important pour le Webhook
app.use('/api/chat', chatRoutes);

app.use('/api/clustering', clusteringRoutes);

// Gestion globale des erreurs
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Une erreur est survenue sur le serveur' });
});

app.listen(PORT, async () => {
  console.log(`Serveur demarre sur le port ${PORT}`);

  // Precharge le modele NLP en arriere-plan
  console.log('Prechargement du modele NLP...');
  preloadModel()
    .then(() => console.log('Modele NLP pret pour le clustering'))
    .catch(err => console.error('Echec du prechargement NLP:', err.message));

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
