import express from 'express';
import { 
  getSurveys, 
  getActiveSurvey,            // 🆕 (Artus)
  getSurveyById, 
  submitSurveyResponse, 
  submitPublicSurveyResponse, // 🆕 (Artus)
  getSurveyResults,
  createSurvey                // 🆕 (Ajouté dans le contrôleur précédent)
} from '../controllers/surveyController.js';

// ✅ SÉCURITÉ : On utilise TON middleware corrigé
import { verifyToken, isAdmin } from '../middlewares/auth.js';

const router = express.Router();

// ==========================================
// 🔓 ROUTES PUBLIQUES
// ==========================================

// Liste de tous les sondages
router.get('/', getSurveys);

// Le sondage "À la une" (pour l'accueil)
router.get('/active', getActiveSurvey);

// Détails d'un sondage spécifique
router.get('/:id', getSurveyById);

// Répondre sans être connecté (Anonyme)
router.post('/public-response', submitPublicSurveyResponse);


// ==========================================
// 🔒 ROUTES PROTÉGÉES (Utilisateur connecté)
// ==========================================

// Répondre en tant que membre
router.post('/response', verifyToken, submitSurveyResponse);


// ==========================================
// 👑 ADMIN / MODO
// ==========================================

// Créer un nouveau sondage (On l'a codé, il faut la route !)
router.post('/', verifyToken, createSurvey);

// Voir les résultats
router.get('/:id/results', verifyToken, getSurveyResults);

export default router;