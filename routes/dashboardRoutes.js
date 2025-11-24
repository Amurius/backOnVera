import express from 'express';
import { 
  getDashboardStats, 
  getMySurveys, 
  getMyResponses 
} from '../controllers/dashboardController.js';

// 👇 CORRECTION : On importe 'verifyToken' (le nouveau nom)
import { verifyToken } from '../middlewares/auth.js';

const router = express.Router();

// 🔒 SÉCURITÉ GLOBALE
// Cette ligne dit : "Applique verifyToken à TOUTES les routes ci-dessous"
// C'est très propre, ça évite de le répéter à chaque ligne.
router.use(verifyToken);

router.get('/stats', getDashboardStats);
router.get('/my-surveys', getMySurveys);
router.get('/my-responses', getMyResponses);

export default router;