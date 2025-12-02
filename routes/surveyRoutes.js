import express from 'express';
import {
  getSurveys,
  getAllSurveys,
  getActiveSurvey,
  getSurveyById,
  submitSurveyResponse,
  submitPublicSurveyResponse,
  getSurveyResults,
  createSurvey,
  setActiveSurvey,
  deactivateSurvey,
  deleteSurvey
} from '../controllers/surveyController.js';

import { verifyToken, isAdmin } from '../middlewares/auth.js';

const router = express.Router();

// ==========================================
// ROUTES PUBLIQUES
// ==========================================

// Liste des sondages actifs
router.get('/', getSurveys);

// Le sondage actif (pour l'accueil)
router.get('/active', getActiveSurvey);

// Repondre sans etre connecte (Anonyme)
router.post('/public-response', submitPublicSurveyResponse);

// ==========================================
// ROUTES PROTEGEES (Utilisateur connecte)
// ==========================================

// Repondre en tant que membre
router.post('/response', verifyToken, submitSurveyResponse);

// ==========================================
// ADMIN / MODO
// ==========================================

// Liste de TOUS les sondages (actifs et inactifs)
router.get('/all', verifyToken, getAllSurveys);

// Creer un nouveau sondage
router.post('/', verifyToken, createSurvey);

// Activer un sondage (desactive les autres)
router.put('/:id/activate', verifyToken, setActiveSurvey);

// Desactiver un sondage
router.put('/:id/deactivate', verifyToken, deactivateSurvey);

// Supprimer un sondage
router.delete('/:id', verifyToken, deleteSurvey);

// Voir les resultats
router.get('/:id/results', verifyToken, getSurveyResults);

// Details d'un sondage specifique (doit etre apres les routes specifiques)
router.get('/:id', getSurveyById);

export default router;