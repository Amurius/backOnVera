import express from 'express';
import { 
  getDashboardStats, 
  getMySurveys, 
  getMyResponses 
} from '../controllers/dashboardController.js';

// ✅ On utilise le bon middleware
import { verifyToken } from '../middlewares/auth.js';

const router = express.Router();

// 🔒 On protège toutes les routes ci-dessous
router.use(verifyToken);

router.get('/stats', getDashboardStats);
router.get('/my-surveys', getMySurveys);
router.get('/my-responses', getMyResponses);

export default router;