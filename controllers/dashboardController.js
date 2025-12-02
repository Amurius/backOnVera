import { query } from '../db/config.js';
// Librérie pour générer du CSV (Adam)
import { stringify } from 'csv-stringify';


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