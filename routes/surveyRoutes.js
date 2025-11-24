import express from 'express';
import {
  getSurveys,
  getSurveyById,
  submitSurveyResponse,
  submitPublicSurveyResponse,
  getSurveyResults,
  getActiveSurvey
} from '../controllers/surveyController.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = express.Router();

router.get('/', getSurveys);
router.get('/active', getActiveSurvey);
router.get('/:id', getSurveyById);
router.post('/response', authMiddleware, submitSurveyResponse);
router.post('/public-response', submitPublicSurveyResponse);
router.get('/:id/results', authMiddleware, getSurveyResults);

export default router;
