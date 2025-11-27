import { query } from '../db/config.js';

export const getDashboardStats = async (req, res) => {
  try {
    const userId = req.userId;

    // 1. STATS SONDAGES (Code d'Artus)
    const surveysCreatedResult = await query(
      'SELECT COUNT(*) as count FROM surveys WHERE created_by = $1',
      [userId]
    );

    const responsesGivenResult = await query(
      'SELECT COUNT(*) as count FROM survey_responses WHERE user_id = $1',
      [userId]
    );

    // 2. STATS FACT-CHECKING (Ajout d'Amina pour Mission 1 & 3) 🚀
    const videoAnalysesResult = await query(
      'SELECT COUNT(*) as count FROM video_analyses WHERE user_id = $1',
      [userId]
    );

    const ocrAnalysesResult = await query(
      'SELECT COUNT(*) as count FROM ocr_analyses WHERE user_id = $1',
      [userId]
    );

    // 3. LISTES RÉCENTES
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
        responsesGiven: parseInt(responsesGivenResult.rows[0].count),
        // 👇 Les nouvelles stats pour ton Dashboard complet
        videosChecked: parseInt(videoAnalysesResult.rows[0].count), 
        imagesChecked: parseInt(ocrAnalysesResult.rows[0].count)
      },
      recentSurveys: recentSurveysResult.rows,
      recentResponses: recentResponsesResult.rows
    });
  } catch (error) {
    console.error('Erreur dashboard:', error);
    res.status(500).json({ message: 'Erreur serveur dashboard' });
  }
};

// (Ces fonctions ne changent pas, elles sont OK)
export const getMySurveys = async (req, res) => {
  try {
    const userId = req.userId;
    const result = await query(
      'SELECT s.*, COUNT(DISTINCT sr.id) as response_count FROM surveys s LEFT JOIN survey_responses sr ON s.id = sr.survey_id WHERE s.created_by = $1 GROUP BY s.id ORDER BY s.created_at DESC',
      [userId]
    );
    res.json({ surveys: result.rows });
  } catch (error) {
    console.error('Erreur sondages:', error);
    res.status(500).json({ message: 'Erreur récupération sondages' });
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
    console.error('Erreur réponses:', error);
    res.status(500).json({ message: 'Erreur récupération réponses' });
  }
};