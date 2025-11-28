import { query } from '../db/config.js';


export const getDashboardStats = async (req, res) => {
  try {
    const userId = req.userId;
    // 6. LISTES RECENTES
    const recentSurveysResult = await query(
      'SELECT s.*, COUNT(DISTINCT sr.id) as response_count FROM surveys s LEFT JOIN survey_responses sr ON s.id = sr.survey_id WHERE s.created_by = $1 GROUP BY s.id ORDER BY s.created_at DESC LIMIT 5',
      [userId]
    );

    res.json({
      stats: {
        // ... tes stats ...
        recentSurveys: recentSurveysResult.rows
      }
    });
  } catch (error) {
    console.error('Erreur dashboard:', error);
    res.status(500).json({ message: 'Erreur serveur dashboard' });
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
        res.status(500).json({ message: 'Erreur récupération réponses' });
      }
};


export const getTopQuestions = async (req, res) => {
  try {
    const { startDate, endDate, country, lang, period } = req.query;

    const params = [];
    let paramIndex = 1;
    let filters = [];

    if (startDate && endDate) {
      filters.push(`t.created_at BETWEEN $${paramIndex} AND $${paramIndex + 1}`);
      params.push(startDate, endDate);
      paramIndex += 2;
    } else {
      let interval = '7 days';
      if (period === '30d') interval = '30 days';
      if (period === '1y') interval = '1 year';
      
      filters.push(`t.created_at >= NOW() - INTERVAL '${interval}'`);
    }

    if (country) {
      filters.push(`u.country = $${paramIndex}`);
      params.push(country);
      paramIndex++;
    }

    if (lang) {
      filters.push(`u.language = $${paramIndex}`);
      params.push(lang);
      paramIndex++;
    }

    // Construction du WHERE SQL
    const whereClause = filters.length > 0 ? 'WHERE ' + filters.join(' AND ') : '';

    const sql = `
      SELECT 
        TRIM(t.extracted_text) as question, 
        COUNT(*) as frequency
      FROM ocr_analyses t
      JOIN users u ON t.user_id = u.id
      ${whereClause}
      GROUP BY TRIM(t.extracted_text)
      ORDER BY frequency DESC
      LIMIT 10;
    `;

    const result = await query(sql, params);

    res.json(result.rows);

  } catch (error) {
    console.error('Erreur Top Questions:', error);
    res.status(500).json({ message: 'Erreur serveur stats' });
  }
};