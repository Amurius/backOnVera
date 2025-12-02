import express from 'express';
import { 
  getDashboardStats, 
  getMySurveys, 
  getMyResponses,
  getTopQuestions,
  getUserQuestions,getFilterOptions
} from '../controllers/dashboardController.js';

import { verifyToken } from '../middlewares/auth.js';

const router = express.Router();

router.use(verifyToken);

router.get('/stats', getDashboardStats);
router.get('/my-surveys', getMySurveys);
router.get('/my-responses', getMyResponses);
router.get('/user-questions', getUserQuestions);
router.get('/top-questions', verifyToken, getTopQuestions);
router.get('/filters', verifyToken, getFilterOptions);

export default router;
