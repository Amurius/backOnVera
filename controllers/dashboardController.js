import { query } from '../db/config.js';
// Librérie pour générer du CSV (Adam)
import { stringify } from 'csv-stringify';

// ===============================
//  DASHBOARD (Sondages) - Stats GLOBALES
// ===============================
export const getDashboardStats = async (req, res) => {
    try {
        // 1. Sondage actif
        const activeSurveyResult = await query(
            `SELECT s.*, u.email as creator_email
             FROM surveys s
             LEFT JOIN users u ON s.created_by = u.id
             WHERE s.is_active = true
             LIMIT 1`
        );
        const activeSurvey = activeSurveyResult.rows[0] || null;

        // 2. Questions du sondage actif
        let questions = [];
        if (activeSurvey) {
            const questionsResult = await query(
                `SELECT *
                 FROM questions
                 WHERE survey_id = $1
                 ORDER BY order_index`,
                [activeSurvey.id]
            );
            questions = questionsResult.rows;
        }

        // 3. Total réponses du sondage actif (TOUTES les réponses, pas filtrées par user)
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

        // 4. Statistiques GLOBALES (sans filtre userId)
        const surveysCreatedResult = await query(
            'SELECT COUNT(*) as count FROM surveys'
        );

        const videoAnalysesResult = await query(
            'SELECT COUNT(*) as count FROM video_analyses'
        );

        const ocrAnalysesResult = await query(
            'SELECT COUNT(*) as count FROM ocr_analyses'
        );

        // 5. Sondages récents avec leur nombre de réponses (tous les sondages)
        const recentSurveysResult = await query(
            `SELECT s.*, u.email as creator_email, COUNT(DISTINCT sr.id) as response_count
             FROM surveys s
             LEFT JOIN users u ON s.created_by = u.id
             LEFT JOIN survey_responses sr ON s.id = sr.survey_id
             GROUP BY s.id, u.email
             ORDER BY s.created_at DESC
             LIMIT 5`
        );

        res.json({
            stats: {
                survey: activeSurvey,
                questions,
                totalResponses,
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

// ===============================
//  🔥 RÉCUPÉRER TOUTES LES QUESTIONS (Celle qui manquait !)
// ===============================
export const getUserQuestions = async (req, res) => {
    try {
        const result = await query(
            `SELECT 
                id,
                question_text,
                cluster_id,
                similarity_score,
                country,
                language,
                created_at
             FROM user_questions
             ORDER BY created_at DESC`
        );

        res.json({ questions: result.rows });

    } catch (error) {
        console.error("Erreur récupération user_questions:", error);
        res.status(500).json({ message: "Erreur serveur lors de la récupération des questions" });
    }
};

// =========================================================
// 👇 TOP QUESTIONS (CLUSTERING) 👇
// =========================================================
export const getTopQuestions = async (req, res) => {
  try {
    const { startDate, endDate, country, lang, period } = req.query;

    const params = [];
    let paramIndex = 1;
    let filters = [];

    // --- FILTRE DATE (Sur la table user_questions 'uq') ---
    if (startDate && endDate) {
      filters.push(`uq.created_at BETWEEN $${paramIndex} AND $${paramIndex + 1}`);
      params.push(startDate, endDate);
      paramIndex += 2;
    } else {
      let interval = '7 days';
      if (period === '30d') interval = '30 days';
      if (period === '1y') interval = '1 year';
      
      filters.push(`uq.created_at >= NOW() - INTERVAL '${interval}'`);
    }

    // --- FILTRE PAYS (Sur 'uq') ---
    if (country) {
      filters.push(`uq.country = $${paramIndex}`);
      params.push(country);
      paramIndex++;
    }

    // --- FILTRE LANGUE (Sur 'uq') ---
    if (lang) {
      filters.push(`uq.language = $${paramIndex}`);
      params.push(lang);
      paramIndex++;
    }

    const whereClause = filters.length > 0 ? 'AND ' + filters.join(' AND ') : '';

    // --- REQUÊTE JOINTURE (Clusters + Questions) ---
    // On prend le "texte représentatif" du cluster (plus propre)
    // On compte combien de questions (uq) sont liées à ce cluster
    const sql = `
      SELECT 
        qc.representative_text as question,
        COUNT(uq.id) as frequency,
        MAX(uq.created_at) as "lastActivityAt",
        qc.id as "clusterId",
        MAX(uq.country) as country,
        MAX(uq.language) as language,
        1.0 as "similarityScore"
      FROM question_clusters qc
      JOIN user_questions uq ON uq.cluster_id = qc.id
      WHERE qc.is_active = TRUE
      ${whereClause}
      GROUP BY qc.id, qc.representative_text
      ORDER BY frequency DESC
      LIMIT 10;
    `;

    const result = await query(sql, params);

    res.json(result.rows);

  } catch (error) {
    console.error('Erreur Top Questions (Clusters):', error);
    res.status(500).json({ message: 'Erreur serveur stats', detail: error.message });
  }
};


// 👇 Récupération du CSV Multi-sections 👇
  export const exportFullDashboardCSV = async (req, res) => {
    try {
      const userId = req.userId;

      // ==================================================================
      // 1. PRÉPARATION DES REQUÊTES BDD (On lance tout en parallèle pour aller vite)
      // ==================================================================

      // A. Requête Recent Surveys (getDashboardStats)
      const recentSurveysPromise = query(
        'SELECT s.id, s.title, s.created_at, COUNT(DISTINCT sr.id) as response_count FROM surveys s LEFT JOIN survey_responses sr ON s.id = sr.survey_id WHERE s.created_by = $1 GROUP BY s.id ORDER BY s.created_at DESC LIMIT 5',
        [userId]
      );

      // B. Requête My Surveys (getMySurveys)
      const mySurveysPromise = query(
        'SELECT s.id, s.title, s.description, s.created_at, s.is_active, COUNT(DISTINCT sr.id) as response_count FROM surveys s LEFT JOIN survey_responses sr ON s.id = sr.survey_id WHERE s.created_by = $1 GROUP BY s.id ORDER BY s.created_at DESC',
        [userId]
      );

      // C. Requête My Responses (getMyResponses)
      const myResponsesPromise = query(
        'SELECT sr.id, sr.created_at, s.title as survey_title FROM survey_responses sr JOIN surveys s ON sr.survey_id = s.id WHERE sr.user_id = $1 ORDER BY sr.created_at DESC',
        [userId]
      );

      // D. Requête Top Questions (getTopQuestions - avec filtres)
      // --- Logique de filtre copiée ---
      const { startDate, endDate, country, lang, period } = req.query;
      const paramsTQ = [];
      let paramIndexTQ = 1;
      let filtersTQ = [];

      if (startDate && endDate) {
        filtersTQ.push(`t.created_at BETWEEN $${paramIndexTQ} AND $${paramIndexTQ + 1}`);
        paramsTQ.push(startDate, endDate);
        paramIndexTQ += 2;
      } else {
        let interval = '7 days';
        if (period === '30d') interval = '30 days';
        if (period === '1y') interval = '1 year';
        filtersTQ.push(`t.created_at >= NOW() - INTERVAL '${interval}'`);
      }
      if (country) {
        filtersTQ.push(`u.country = $${paramIndexTQ}`);
        paramsTQ.push(country);
        paramIndexTQ++;
      }
      if (lang) {
        filtersTQ.push(`u.language = $${paramIndexTQ}`);
        paramsTQ.push(lang);
        paramIndexTQ++;
      }
      const whereClauseTQ = filtersTQ.length > 0 ? 'WHERE ' + filtersTQ.join(' AND ') : '';

      const topQuestionsSql = `
        SELECT TRIM(t.extracted_text) as question, COUNT(*) as frequency
        FROM ocr_analyses t JOIN users u ON t.user_id = u.id
        ${whereClauseTQ}
        GROUP BY TRIM(t.extracted_text) ORDER BY frequency DESC LIMIT 10;
      `;
      const topQuestionsPromise = query(topQuestionsSql, paramsTQ);
      // --- Fin logique de filtre ---


      // On attend que toutes les requêtes soient finies
      const [recentSurveysRes, mySurveysRes, myResponsesRes, topQuestionsRes] = await Promise.all([
        recentSurveysPromise,
        mySurveysPromise,
        myResponsesPromise,
        topQuestionsPromise
      ]);


      // ==================================================================
      // 2. CONFIGURATION DU CSV
      // ==================================================================
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.write('\ufeff'); // BOM pour Excel
      res.setHeader('Content-Disposition', `attachment; filename="export_complet_dashboard_${new Date().toISOString().split('T')[0]}.csv"`);

      // IMPORTANT : header: false car on va gérer les en-têtes manuellement par section
      const stringifier = stringify({ header: false, delimiter: ';' });

      stringifier.on('error', (err) => { console.error('Erreur stream CSV:', err); });
      stringifier.pipe(res);


      // ==================================================================
      // 3. ÉCRITURE DES SECTIONS
      // ==================================================================

      // --- SECTION 1 : SONDAGES RÉCENTS ---
      stringifier.write(['--- 1. SONDAGES RÉCENTS (TOP 5) ---']); // Titre de section
      stringifier.write(['ID', 'Titre', 'Date Création', 'Nb Réponses']); // En-têtes manuels
      recentSurveysRes.rows.forEach(row => {
         // On map les données pour correspondre à l'ordre des en-têtes ci-dessus
         stringifier.write([row.id, row.title, row.created_at, row.response_count]);
      });
      stringifier.write([]); // Ligne vide de séparation

      // --- SECTION 2 : TOUS MES SONDAGES ---
      stringifier.write(['--- 2. TOUS MES SONDAGES ---']);
      stringifier.write(['ID', 'Titre', 'Description', 'Date Création', 'Actif?', 'Nb Réponses']);
      mySurveysRes.rows.forEach(row => {
        stringifier.write([row.id, row.title, row.description, row.created_at, row.is_active, row.response_count]);
      });
      stringifier.write([]); // Ligne vide

      // --- SECTION 3 : TOUTES MES RÉPONSES ---
      stringifier.write(['--- 3. TOUTES MES RÉPONSES DONNÉES ---']);
      stringifier.write(['ID Réponse', 'Date Réponse', 'Sondage concerné']);
      myResponsesRes.rows.forEach(row => {
        stringifier.write([row.id, row.created_at, row.survey_title]);
      });
      stringifier.write([]); // Ligne vide

       // --- SECTION 4 : TOP QUESTIONS (Filtrées) ---
       // On ajoute une info sur les filtres appliqués dans le titre
       const filterInfo = period ? `(Période: ${period}, Pays: ${country || 'Tous'}, Langue: ${lang || 'Toutes'})` : '(Filtres personnalisés)';
       stringifier.write([`--- 4. TOP QUESTIONS FRÉQUENTES ${filterInfo} ---`]);
       stringifier.write(['Question Extraite', 'Fréquence']);
       topQuestionsRes.rows.forEach(row => {
         stringifier.write([row.question, row.frequency]);
       });

      // Fin du flux
      stringifier.end();

    } catch (error) {
      console.error('Erreur export complet CSV:', error);
      if (!res.headersSent) {
        res.status(500).send("Erreur serveur lors de l'export complet CSV. Vérifiez les logs.");
      }
    }
  };
export const getFilterOptions = async (req, res) => {
  try {
    // 1. Récupérer tous les pays uniques présents en base
    const countriesResult = await query(
      `SELECT DISTINCT country
       FROM user_questions
       WHERE country IS NOT NULL AND country != 'XX'
       ORDER BY country ASC`
    );

    // 2. Récupérer toutes les langues uniques présentes en base
    const languagesResult = await query(
      `SELECT DISTINCT language
       FROM user_questions
       WHERE language IS NOT NULL AND language != 'xx'
       ORDER BY language ASC`
    );

    // 3. Renvoyer les listes simples
    res.json({
      countries: countriesResult.rows.map(row => row.country),
      languages: languagesResult.rows.map(row => row.language)
    });

  } catch (error) {
    console.error('Erreur récupération filtres:', error);
    res.status(500).json({ message: 'Erreur serveur filtres' });
  }
};

// =========================================================
// 📊 STATS PAR PAYS
// =========================================================
export const getCountryStats = async (req, res) => {
  try {
    const result = await query(
      `SELECT
        country,
        COUNT(*) as count
       FROM user_questions
       WHERE country IS NOT NULL AND country != 'XX'
       GROUP BY country
       ORDER BY count DESC
       LIMIT 10`
    );

    res.json({
      success: true,
      countries: result.rows
    });

  } catch (error) {
    console.error('Erreur stats pays:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur stats pays' });
  }
};

// =========================================================
// 📊 STATS PAR LANGUE
// =========================================================
export const getLanguageStats = async (req, res) => {
  try {
    const result = await query(
      `SELECT
        language as lang,
        COUNT(*) as count
       FROM user_questions
       WHERE language IS NOT NULL AND language != 'xx'
       GROUP BY language
       ORDER BY count DESC
       LIMIT 10`
    );

    res.json({
      success: true,
      languages: result.rows
    });

  } catch (error) {
    console.error('Erreur stats langues:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur stats langues' });
  }
};

// =========================================================
// 📈 EVOLUTION TEMPORELLE (Area Chart)
// =========================================================
export const getTimeSeriesStats = async (req, res) => {
  try {
    const { period } = req.query;

    let interval = '7 days';
    let groupBy = 'day';
    let dateFormat = 'DD/MM';

    if (period === '30d') {
      interval = '30 days';
      groupBy = 'day';
      dateFormat = 'DD/MM';
    } else if (period === '12m' || period === '1y') {
      interval = '12 months';
      groupBy = 'month';
      dateFormat = 'Mon YYYY';
    }

    // Requête pour obtenir le nombre de questions par jour/mois
    const sql = groupBy === 'day'
      ? `SELECT
          TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') as date,
          TO_CHAR(DATE_TRUNC('day', created_at), '${dateFormat}') as label,
          COUNT(*) as count
         FROM user_questions
         WHERE created_at >= NOW() - INTERVAL '${interval}'
         GROUP BY DATE_TRUNC('day', created_at)
         ORDER BY date ASC`
      : `SELECT
          TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as date,
          TO_CHAR(DATE_TRUNC('month', created_at), 'Mon') as label,
          COUNT(*) as count
         FROM user_questions
         WHERE created_at >= NOW() - INTERVAL '${interval}'
         GROUP BY DATE_TRUNC('month', created_at)
         ORDER BY date ASC`;

    const result = await query(sql);

    res.json({
      success: true,
      period,
      data: result.rows
    });

  } catch (error) {
    console.error('Erreur stats temporelles:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur stats temporelles' });
  }
};
