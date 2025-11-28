import { query } from '../db/config.js';

// ==========================================
// 1. CRÉER UN SONDAGE (C'est celle qui manquait !)
// ==========================================
export const createSurvey = async (req, res) => {
  try {
    const { title, description, questions } = req.body;
    const userId = req.userId; // Admin/Modo connecté

    if (!title || !questions || questions.length === 0) {
      return res.status(422).json({ message: "Titre et questions requis." });
    }

    // 1. Créer le sondage
    const surveyResult = await query(
      `INSERT INTO surveys (title, description, created_by, is_active) 
       VALUES ($1, $2, $3, true) 
       RETURNING id`,
      [title, description, userId]
    );
    const surveyId = surveyResult.rows[0].id;

    // 2. Ajouter les questions (Boucle)
    const promises = questions.map((q, index) => {
      return query(
        `INSERT INTO questions (survey_id, question_text, question_type, options, order_index) 
         VALUES ($1, $2, $3, $4, $5)`,
        [
          surveyId, 
          q.text, 
          q.type || 'text', 
          JSON.stringify(q.options || []), // On stocke les options (Oui/Non)
          index
        ]
      );
    });

    await Promise.all(promises);

    res.status(201).json({ message: "Sondage créé avec succès !", surveyId });

  } catch (error) {
    console.error("Erreur création:", error);
    res.status(500).json({ message: "Erreur lors de la création du sondage" });
  }
};

// ==========================================
// 2. LISTE DES SONDAGES (actifs uniquement)
// ==========================================
export const getSurveys = async (req, res) => {
  try {
    const result = await query(
      `SELECT s.*, u.email as creator_email
       FROM surveys s
       JOIN users u ON s.created_by = u.id
       WHERE s.is_active = true
       ORDER BY s.created_at DESC`
    );
    res.json({ surveys: result.rows });
  } catch (error) {
    res.status(500).json({ message: 'Erreur récupération sondages' });
  }
};

// ==========================================
// 2b. LISTE DE TOUS LES SONDAGES (admin)
// ==========================================
export const getAllSurveys = async (req, res) => {
  try {
    const result = await query(
      `SELECT s.*, u.email as creator_email,
        (SELECT COUNT(*) FROM survey_responses sr WHERE sr.survey_id = s.id) as response_count
       FROM surveys s
       JOIN users u ON s.created_by = u.id
       ORDER BY s.is_active DESC, s.created_at DESC`
    );
    res.json({ surveys: result.rows });
  } catch (error) {
    console.error('Erreur getAllSurveys:', error);
    res.status(500).json({ message: 'Erreur récupération sondages' });
  }
};

// ==========================================
// 2c. ACTIVER UN SONDAGE (desactive les autres)
// ==========================================
export const setActiveSurvey = async (req, res) => {
  try {
    const { id } = req.params;

    // Desactiver tous les sondages
    await query('UPDATE surveys SET is_active = false WHERE is_active = true');

    // Activer le sondage selectionne
    const result = await query(
      'UPDATE surveys SET is_active = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Sondage non trouve' });
    }

    res.json({ message: 'Sondage active avec succes', survey: result.rows[0] });
  } catch (error) {
    console.error('Erreur setActiveSurvey:', error);
    res.status(500).json({ message: 'Erreur activation sondage' });
  }
};

// ==========================================
// 2d. DESACTIVER UN SONDAGE
// ==========================================
export const deactivateSurvey = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'UPDATE surveys SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Sondage non trouve' });
    }

    res.json({ message: 'Sondage desactive', survey: result.rows[0] });
  } catch (error) {
    console.error('Erreur deactivateSurvey:', error);
    res.status(500).json({ message: 'Erreur desactivation sondage' });
  }
};

// ==========================================
// 2e. SUPPRIMER UN SONDAGE
// ==========================================
export const deleteSurvey = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query('DELETE FROM surveys WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Sondage non trouve' });
    }

    res.json({ message: 'Sondage supprime avec succes' });
  } catch (error) {
    console.error('Erreur deleteSurvey:', error);
    res.status(500).json({ message: 'Erreur suppression sondage' });
  }
};

// ==========================================
// 3. SONDAGE ACTIF (Pour l'accueil)
// ==========================================
export const getActiveSurvey = async (req, res) => {
  try {
    const surveyResult = await query(
      'SELECT * FROM surveys WHERE is_active = true ORDER BY updated_at DESC LIMIT 1'
    );

    if (surveyResult.rows.length === 0) return res.status(404).json({ message: 'Aucun sondage actif' });

    const survey = surveyResult.rows[0];
    const questionsResult = await query(
      'SELECT * FROM questions WHERE survey_id = $1 ORDER BY order_index',
      [survey.id]
    );

    res.json({ survey, questions: questionsResult.rows });
  } catch (error) {
    res.status(500).json({ message: 'Erreur sondage actif' });
  }
};

// ==========================================
// 4. DÉTAIL SONDAGE
// ==========================================
export const getSurveyById = async (req, res) => {
  try {
    const { id } = req.params;
    const surveyResult = await query('SELECT * FROM surveys WHERE id = $1', [id]);

    if (surveyResult.rows.length === 0) return res.status(404).json({ message: 'Introuvable' });

    const questionsResult = await query(
      'SELECT * FROM questions WHERE survey_id = $1 ORDER BY order_index',
      [id]
    );

    res.json({ survey: surveyResult.rows[0], questions: questionsResult.rows });
  } catch (error) {
    res.status(500).json({ message: 'Erreur récupération' });
  }
};

// ==========================================
// 5. RÉPONSE CONNECTÉE (Membre)
// ==========================================
export const submitSurveyResponse = async (req, res) => {
  try {
    const { surveyId, responses } = req.body;
    const userId = req.userId;

    if (!surveyId || !responses) return res.status(422).json({ message: "Données manquantes" });

    const surveyResponseResult = await query(
      'INSERT INTO survey_responses (survey_id, user_id) VALUES ($1, $2) RETURNING id',
      [surveyId, userId]
    );
    const responseId = surveyResponseResult.rows[0].id;

    const promises = responses.map(r => query(
      'INSERT INTO question_responses (survey_response_id, question_id, answer) VALUES ($1, $2, $3)',
      [responseId, r.questionId, r.answer]
    ));
    await Promise.all(promises);

    res.status(201).json({ message: 'Réponse enregistrée', surveyResponseId: responseId });
  } catch (error) {
    res.status(500).json({ message: 'Erreur envoi réponse' });
  }
};

// ==========================================
// 6. RÉPONSE PUBLIQUE (Anonyme)
// ==========================================
export const submitPublicSurveyResponse = async (req, res) => {
  try {
    const { surveyId, responses } = req.body;
    if (!surveyId || !responses) return res.status(422).json({ message: "Données manquantes" });

    const userResult = await query(
      `SELECT id from user where email = 'anonyme@anonyme.com'`
    );
    const anonId = userResult.rows[0].id;

    const surveyResponseResult = await query(
      'INSERT INTO survey_responses (survey_id, user_id) VALUES ($1, $2) RETURNING id',
      [surveyId, anonId]
    );
    const responseId = surveyResponseResult.rows[0].id;

    const promises = responses.map(r => query(
      'INSERT INTO question_responses (survey_response_id, question_id, answer) VALUES ($1, $2, $3)',
      [responseId, r.questionId, r.answer]
    ));
    await Promise.all(promises);

    res.status(201).json({ message: 'Réponse anonyme enregistrée', success: true });
  } catch (error) {
    console.error("Erreur public:", error);
    res.status(500).json({ message: 'Erreur réponse anonyme' });
  }
};


export const getSurveyResults = async (req, res) => {
  try {
    const { id } = req.params;
    const surveyResult = await query('SELECT * FROM surveys WHERE id = $1', [id]);
    if (surveyResult.rows.length === 0) return res.status(404).json({ message: 'Non trouvé' });

    const responsesResult = await query(
      'SELECT COUNT(DISTINCT id) as total_responses FROM survey_responses WHERE survey_id = $1',
      [id]
    );

    const questionsResult = await query(
      `SELECT q.*, COUNT(qr.id) as response_count 
       FROM questions q 
       LEFT JOIN question_responses qr ON q.id = qr.question_id 
       WHERE q.survey_id = $1 
       GROUP BY q.id 
       ORDER BY q.order_index`,
      [id]
    );

    res.json({
      survey: surveyResult.rows[0],
      totalResponses: responsesResult.rows[0].total_responses,
      questions: questionsResult.rows
    });
  } catch (error) {
    res.status(500).json({ message: 'Erreur récupération résultats' });
  }
};
