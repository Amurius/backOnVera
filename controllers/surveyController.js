import { query } from '../db/config.js';

export const getSurveys = async (req, res) => {
  try {
    const result = await query(
      'SELECT s.*, u.email as creator_email FROM surveys s JOIN users u ON s.created_by = u.id WHERE s.is_active = true ORDER BY s.created_at DESC'
    );

    res.json({ surveys: result.rows });
  } catch (error) {
    console.error('Erreur lors de la récupération des sondages:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des sondages' });
  }
};

export const getSurveyById = async (req, res) => {
  try {
    const { id } = req.params;

    const surveyResult = await query(
      'SELECT s.*, u.email as creator_email FROM surveys s JOIN users u ON s.created_by = u.id WHERE s.id = $1',
      [id]
    );

    if (surveyResult.rows.length === 0) {
      return res.status(404).json({ message: 'Sondage non trouvé' });
    }

    const questionsResult = await query(
      'SELECT * FROM questions WHERE survey_id = $1 ORDER BY order_index',
      [id]
    );

    res.json({
      survey: surveyResult.rows[0],
      questions: questionsResult.rows
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du sondage:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération du sondage' });
  }
};

export const submitSurveyResponse = async (req, res) => {
  try {
    const { surveyId, responses } = req.body;
    const userId = req.userId;

    if (!surveyId || !responses || responses.length === 0) {
      return res.status(400).json({ message: 'ID du sondage et réponses requis' });
    }

    const surveyResponseResult = await query(
      'INSERT INTO survey_responses (survey_id, user_id) VALUES ($1, $2) RETURNING *',
      [surveyId, userId]
    );

    const surveyResponse = surveyResponseResult.rows[0];

    const responsePromises = responses.map(r =>
      query(
        'INSERT INTO question_responses (survey_response_id, question_id, answer) VALUES ($1, $2, $3)',
        [surveyResponse.id, r.questionId, r.answer]
      )
    );

    await Promise.all(responsePromises);

    res.status(201).json({
      message: 'Réponse au sondage enregistrée avec succès',
      surveyResponseId: surveyResponse.id
    });
  } catch (error) {
    console.error('Erreur lors de la soumission du sondage:', error);
    res.status(500).json({ message: 'Erreur lors de la soumission du sondage' });
  }
};

export const getSurveyResults = async (req, res) => {
  try {
    const { id } = req.params;

    const surveyResult = await query(
      'SELECT * FROM surveys WHERE id = $1',
      [id]
    );

    if (surveyResult.rows.length === 0) {
      return res.status(404).json({ message: 'Sondage non trouvé' });
    }

    const responsesResult = await query(
      'SELECT COUNT(DISTINCT sr.id) as total_responses FROM survey_responses sr WHERE sr.survey_id = $1',
      [id]
    );

    const questionsResult = await query(
      'SELECT q.*, COUNT(qr.id) as response_count FROM questions q LEFT JOIN question_responses qr ON q.id = qr.question_id LEFT JOIN survey_responses sr ON qr.survey_response_id = sr.id WHERE q.survey_id = $1 GROUP BY q.id ORDER BY q.order_index',
      [id]
    );

    res.json({
      survey: surveyResult.rows[0],
      totalResponses: responsesResult.rows[0].total_responses,
      questions: questionsResult.rows
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des résultats:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des résultats' });
  }
};
