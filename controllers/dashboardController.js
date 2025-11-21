import { query } from '../db/config.js';

export const getDashboardStats = async (req, res) => {
  try {
    const userId = req.userId;

    const surveysCreatedResult = await query(
      'SELECT COUNT(*) as count FROM surveys WHERE created_by = $1',
      [userId]
    );

    const responsesGivenResult = await query(
      'SELECT COUNT(*) as count FROM survey_responses WHERE user_id = $1',
      [userId]
    );

    const recentSurveysResult = await query(
      'SELECT s.*, COUNT(DISTINCT sr.id) as response_count FROM surveys s LEFT JOIN survey_responses sr ON s.id = sr.survey_id WHERE s.created_by = $1 GROUP BY s.id ORDER BY s.created_at DESC LIMIT 5',
      [userId]
    );

    const recentResponsesResult = await query(
      'SELECT sr.*, s.title as survey_title FROM survey_responses sr JOIN surveys s ON sr.survey_id = s.id WHERE sr.user_id = $1 ORDER BY sr.created_at DESC LIMIT 5',
      [userId]
    );

    res.json({
      stats: {
        surveysCreated: parseInt(surveysCreatedResult.rows[0].count),
        responsesGiven: parseInt(responsesGivenResult.rows[0].count)
      },
      recentSurveys: recentSurveysResult.rows,
      recentResponses: recentResponsesResult.rows
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du dashboard:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération du dashboard' });
  }
};

export const getMySurveys = async (req, res) => {
  try {
    const userId = req.userId;

    const result = await query(
      'SELECT s.*, COUNT(DISTINCT sr.id) as response_count FROM surveys s LEFT JOIN survey_responses sr ON s.id = sr.survey_id WHERE s.created_by = $1 GROUP BY s.id ORDER BY s.created_at DESC',
      [userId]
    );

    res.json({ surveys: result.rows });
  } catch (error) {
    console.error('Erreur lors de la récupération des sondages:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des sondages' });
  }
};

export const getMyResponses = async (req, res) => {
  try {
    const userId = req.userId;

    const result = await query(
      'SELECT sr.*, s.title as survey_title, s.description as survey_description FROM survey_responses sr JOIN surveys s ON sr.survey_id = s.id WHERE sr.user_id = $1 ORDER BY sr.created_at DESC',
      [userId]
    );

    res.json({ responses: result.rows });
  } catch (error) {
    console.error('Erreur lors de la récupération des réponses:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des réponses' });
  }
};
