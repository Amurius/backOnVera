import express from 'express';
import {
  getDashboardStats,
  getMySurveys,
  getMyResponses,
  getTopQuestions,
  exportFullDashboardCSV,
  getUserQuestions,
  getFilterOptions,
  getCountryStats,
  getLanguageStats,
  getTimeSeriesStats
} from '../controllers/dashboardController.js';

import { verifyToken } from '../middlewares/auth.js';

const router = express.Router();

// Applique verifyToken à toutes les routes du dashboard
router.use(verifyToken);

router.get('/stats', getDashboardStats);
router.get('/my-surveys', getMySurveys);
router.get('/my-responses', getMyResponses);
router.get('/export/full', exportFullDashboardCSV);
router.get('/user-questions', getUserQuestions);
router.get('/top-questions', getTopQuestions);
router.get('/filters', getFilterOptions);
router.get('/stats/countries', getCountryStats);
router.get('/stats/languages', getLanguageStats);
router.get('/stats/timeseries', getTimeSeriesStats);

export default router;
