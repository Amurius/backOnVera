import express from 'express';
import {
  getSurveys,
  getSurveyById,
  submitSurveyResponse,
  getSurveyResults
} from '../controllers/surveyController.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = express.Router();

router.get('/', getSurveys);
router.get('/:id', getSurveyById);
router.post('/response', authMiddleware, submitSurveyResponse);
router.get('/:id/results', authMiddleware, getSurveyResults);

export default router;
