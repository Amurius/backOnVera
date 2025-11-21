import express from 'express';
import { getDashboardStats, getMySurveys, getMyResponses } from '../controllers/dashboardController.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = express.Router();

router.use(authMiddleware);

router.get('/stats', getDashboardStats);
router.get('/my-surveys', getMySurveys);
router.get('/my-responses', getMyResponses);

export default router;
