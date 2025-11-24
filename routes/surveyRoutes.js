import express from 'express';
import { 
  getSurveys, 
  getSurveyById, 
  submitSurveyResponse, 
  getSurveyResults 
} from '../controllers/surveyController.js';

// 👇 CORRECTION ICI : On importe 'verifyToken' (plus 'authMiddleware')
import { verifyToken } from '../middlewares/auth.js';

const router = express.Router();

// Routes publiques (ou protégées selon ton choix)
router.get('/', getSurveys);
router.get('/:id', getSurveyById);

// 👇 CORRECTION ICI AUSSI : On utilise 'verifyToken'
router.post('/response', verifyToken, submitSurveyResponse);

// Route protégée pour voir les résultats (optionnel)
router.get('/:id/results', verifyToken, getSurveyResults);

export default router;