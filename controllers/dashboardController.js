import { query } from '../db/config.js';

export const getDashboardStats = async (req, res) => {
  try {
    const userId = req.userId;

    // 1. Recuperer le sondage actif
    const activeSurveyResult = await query(
      `SELECT s.*, u.email as creator_email
       FROM surveys s
       LEFT JOIN users u ON s.created_by = u.id
       WHERE s.is_active = true
       LIMIT 1`
    );
    const activeSurvey = activeSurveyResult.rows[0] || null;

    // 2. Si sondage actif, recuperer ses questions
    let questions = [];
    if (activeSurvey) {
      const questionsResult = await query(
        `SELECT * FROM questions
         WHERE survey_id = $1
         ORDER BY order_index`,
        [activeSurvey.id]
      );
      questions = questionsResult.rows;
    }

    // 3. Compter les reponses du sondage actif
    let totalResponses = 0;
    if (activeSurvey) {
      const responsesCountResult = await query(
        `SELECT COUNT(DISTINCT sr.id) as count
         FROM survey_responses sr
         WHERE sr.survey_id = $1`,
        [activeSurvey.id]
      );
      totalResponses = parseInt(responsesCountResult.rows[0].count);
    }

    // 4. Stats generales
    const surveysCreatedResult = await query(
      'SELECT COUNT(*) as count FROM surveys WHERE created_by = $1',
      [userId]
    );

    // 5. STATS FACT-CHECKING
    const videoAnalysesResult = await query(
      'SELECT COUNT(*) as count FROM video_analyses WHERE user_id = $1',
      [userId]
    );

    const ocrAnalysesResult = await query(
      'SELECT COUNT(*) as count FROM ocr_analyses WHERE user_id = $1',
      [userId]
    );

    // 6. LISTES RECENTES
    const recentSurveysResult = await query(
      'SELECT s.*, COUNT(DISTINCT sr.id) as response_count FROM surveys s LEFT JOIN survey_responses sr ON s.id = sr.survey_id WHERE s.created_by = $1 GROUP BY s.id ORDER BY s.created_at DESC LIMIT 5',
      [userId]
    );

    res.json({
      stats: {
        survey: activeSurvey,
        questions: questions,
        totalResponses: totalResponses,
        totalSurveys: parseInt(surveysCreatedResult.rows[0].count),
        videosChecked: parseInt(videoAnalysesResult.rows[0].count),
        imagesChecked: parseInt(ocrAnalysesResult.rows[0].count),
        recentSurveys: recentSurveysResult.rows
      }
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