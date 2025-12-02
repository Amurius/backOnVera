/**
 * Service de clustering semantique des questions
 * Logique metier principale pour le regroupement des questions
 */

import { query } from '../db/config.js';
import {
    generateEmbedding,
    cosineSimilarity,
    updateCentroid,
    vectorToPostgres,
    postgresVectorToArray,
    normalizeText
} from './nlpService.js';
import { ClusteringConfig } from './clusteringConfig.js';

/**
 * Cache en memoire pour les clusters
 * Evite de recharger les clusters a chaque requete
 */
let clusterCache = {
    data: null,
    timestamp: 0
};

/**
 * Charge tous les clusters actifs depuis la base de donnees
 * Utilise un cache avec TTL configure
 * @param {boolean} forceRefresh - Force le rechargement depuis la BDD
 * @returns {Promise<Array>} Liste des clusters avec leurs centroides
 */
async function loadClusters(forceRefresh = false) {
    const now = Date.now();

    // Utilise le cache si valide
    if (
        !forceRefresh &&
        clusterCache.data &&
        (now - clusterCache.timestamp) < ClusteringConfig.CLUSTER_CACHE_TTL
    ) {
        return clusterCache.data;
    }

    try {
        const result = await query(`
            SELECT
                id,
                representative_text,
                centroid,
                question_count,
                created_at,
                last_activity_at
            FROM question_clusters
            WHERE is_active = TRUE
            ORDER BY question_count DESC
            LIMIT $1
        `, [ClusteringConfig.MAX_CACHED_CLUSTERS]);

        const clusters = result.rows.map(row => ({
            id: row.id,
            representativeText: row.representative_text,
            centroid: row.centroid ? postgresVectorToArray(row.centroid) : null,
            questionCount: row.question_count,
            createdAt: row.created_at,
            lastActivityAt: row.last_activity_at
        }));

        // Met a jour le cache
        clusterCache = {
            data: clusters,
            timestamp: now
        };

        console.log(`${clusters.length} clusters charges en cache`);
        return clusters;
    } catch (error) {
        console.error('Erreur lors du chargement des clusters:', error);
        throw error;
    }
}

/**
 * Invalide le cache des clusters
 * A appeler apres creation/modification d'un cluster
 */
function invalidateCache() {
    clusterCache = {
        data: null,
        timestamp: 0
    };
}

/**
 * Trouve le cluster le plus similaire a un embedding donne
 * @param {Float32Array} embedding - Vecteur de la nouvelle question
 * @param {Array} clusters - Liste des clusters existants
 * @returns {{cluster: Object|null, similarity: number}} Meilleur match et score
 */
function findBestClusterMatch(embedding, clusters) {
    let bestMatch = null;
    let bestSimilarity = -1;

    for (const cluster of clusters) {
        if (!cluster.centroid) {
            continue;
        }

        try {
            const similarity = cosineSimilarity(embedding, cluster.centroid);

            if (similarity > bestSimilarity) {
                bestSimilarity = similarity;
                bestMatch = cluster;
            }
        } catch (error) {
            console.error(`Erreur de calcul pour le cluster ${cluster.id}:`, error);
        }
    }

    return {
        cluster: bestMatch,
        similarity: bestSimilarity
    };
}

/**
 * Cree un nouveau cluster avec la question comme representative
 * @param {string} questionText - Texte de la question
 * @param {Float32Array} embedding - Vecteur d'embedding
 * @returns {Promise<Object>} Le cluster cree
 */
async function createNewCluster(questionText, embedding) {
    const centroidStr = vectorToPostgres(embedding);

    const result = await query(`
        INSERT INTO question_clusters (
            representative_text,
            centroid,
            question_count
        ) VALUES ($1, $2::vector, 1)
        RETURNING id, representative_text, created_at
    `, [questionText, centroidStr]);

    const cluster = result.rows[0];

    console.log(`Nouveau cluster cree: ${cluster.id}`);

    // Invalide le cache
    invalidateCache();

    return {
        id: cluster.id,
        representativeText: cluster.representative_text,
        centroid: embedding,
        questionCount: 1,
        createdAt: cluster.created_at,
        isNew: true
    };
}

/**
 * Met a jour le centroide d'un cluster existant
 * @param {string} clusterId - ID du cluster
 * @param {Float32Array} newEmbedding - Nouvel embedding a integrer
 * @param {number} currentCount - Nombre actuel de questions
 * @param {Float32Array} currentCentroid - Centroide actuel
 */
async function updateClusterCentroid(clusterId, newEmbedding, currentCount, currentCentroid) {
    // Calcule le nouveau centroide
    const newCentroid = updateCentroid(currentCentroid, newEmbedding, currentCount);
    const centroidStr = vectorToPostgres(newCentroid);

    await query(`
        UPDATE question_clusters
        SET
            centroid = $1::vector,
            last_activity_at = CURRENT_TIMESTAMP
        WHERE id = $2
    `, [centroidStr, clusterId]);

    // Invalide le cache pour inclure le nouveau centroide
    invalidateCache();
}

/**
 * Sauvegarde une question dans la base de données
 * CORRECTION ICI : Ajout des backticks (`) et de la variable result
 */
async function saveQuestion(questionText, normalizedText, clusterId, similarityScore, country = null, language = null) {
    const result = await query(`
        INSERT INTO user_questions (
            question_text,
            normalized_text,
            cluster_id,
            similarity_score,
            country,
            language,
            processed_at,
            created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING 
            id,
            question_text AS "questionText",
            normalized_text AS "normalizedText",
            cluster_id AS "clusterId",
            similarity_score AS "similarityScore",
            country,
            language,
            created_at AS "createdAt"
    `, [questionText, normalizedText, clusterId, similarityScore, country, language]);

    return result.rows[0];
}

/**
 * Sauvegarde l'embedding d'une question
 * @param {string} questionId - ID de la question
 * @param {Float32Array} embedding - Vecteur d'embedding
 */
async function saveEmbedding(questionId, embedding) {
    const embeddingStr = vectorToPostgres(embedding);

    await query(`
        INSERT INTO question_embeddings (
            question_id,
            embedding,
            model_name
        ) VALUES ($1, $2::vector, $3)
    `, [questionId, embeddingStr, ClusteringConfig.EMBEDDING_MODEL]);
}

/**
 * Cree le mapping question-cluster
 * @param {string} questionId - ID de la question
 * @param {string} clusterId - ID du cluster
 * @param {number} similarityScore - Score de similarite
 */
async function createClusterMapping(questionId, clusterId, similarityScore) {
    await query(`
        INSERT INTO question_cluster_map (
            question_id,
            cluster_id,
            similarity_score,
            is_current
        ) VALUES ($1, $2, $3, TRUE)
    `, [questionId, clusterId, similarityScore]);
}

/**
 * Met a jour les statistiques quotidiennes
 * @param {boolean} isNewCluster - Si un nouveau cluster a ete cree
 * @param {number} similarity - Score de similarite
 */
async function updateDailyStats(isNewCluster, similarity) {
    const today = new Date().toISOString().split('T')[0];

    await query(`
        INSERT INTO daily_stats (
            stat_date,
            total_questions,
            new_clusters,
            existing_cluster_matches,
            avg_similarity
        ) VALUES ($1, 1, $2, $3, $4)
        ON CONFLICT (stat_date) DO UPDATE SET
            total_questions = daily_stats.total_questions + 1,
            new_clusters = daily_stats.new_clusters + $2,
            existing_cluster_matches = daily_stats.existing_cluster_matches + $3,
            avg_similarity = (
                daily_stats.avg_similarity * daily_stats.total_questions + $4
            ) / (daily_stats.total_questions + 1),
            updated_at = CURRENT_TIMESTAMP
    `, [
        today,
        isNewCluster ? 1 : 0,
        isNewCluster ? 0 : 1,
        similarity || 0
    ]);
}

/**
 * Met a jour les statistiques par cluster
 * @param {string} clusterId - ID du cluster
 * @param {number} similarity - Score de similarite
 */
async function updateClusterStats(clusterId, similarity) {
    const today = new Date().toISOString().split('T')[0];

    await query(`
        INSERT INTO cluster_stats (
            cluster_id,
            stat_date,
            question_count,
            avg_similarity
        ) VALUES ($1, $2, 1, $3)
        ON CONFLICT (cluster_id, stat_date) DO UPDATE SET
            question_count = cluster_stats.question_count + 1,
            avg_similarity = (
                cluster_stats.avg_similarity * cluster_stats.question_count + $3
            ) / (cluster_stats.question_count + 1),
            updated_at = CURRENT_TIMESTAMP
    `, [clusterId, today, similarity]);
}

/**
 * FONCTION PRINCIPALE: Traite une nouvelle question
 * @param {string} questionText - Texte de la question
 * @returns {Promise<Object>} Resultat du traitement
 */
export async function processQuestion(questionText, country = null, language = null) {
    // Validation de l'entree
    if (!questionText || typeof questionText !== 'string') {
        throw new Error('Le texte de la question est requis');
    }

    const trimmedText = questionText.trim();
    if (trimmedText.length < ClusteringConfig.MIN_QUESTION_LENGTH) {
        throw new Error(
            `La question doit contenir au moins ${ClusteringConfig.MIN_QUESTION_LENGTH} caracteres`
        );
    }

    console.log(`Traitement de la question: "${trimmedText.substring(0, 50)}..."`);

    try {
        // 1. Normalise le texte
        const normalizedText = normalizeText(trimmedText);

        // 2. Genere l'embedding
        const embedding = await generateEmbedding(trimmedText);
        console.log(`Embedding genere (dimension: ${embedding.length})`);

        // 3. Charge les clusters existants
        const clusters = await loadClusters();
        console.log(`${clusters.length} clusters existants`);

        let cluster = null;
        let similarity = 0;
        let isNewCluster = false;

        if (clusters.length === 0) {
            // Premier cluster
            console.log('Aucun cluster existant, creation du premier cluster');
            cluster = await createNewCluster(trimmedText, embedding);
            isNewCluster = true;
            similarity = 1;
        } else {
            // 4. Trouve le meilleur match
            const match = findBestClusterMatch(embedding, clusters);
            
            if (match.cluster) {
                console.log(`Meilleur match: ${match.similarity.toFixed(4)}`);
                // 5. Applique le seuil
                if (match.similarity >= ClusteringConfig.SIMILARITY_THRESHOLD) {
                    // Associe au cluster existant
                    cluster = match.cluster;
                    similarity = match.similarity;

                    // Met a jour le centroide
                    await updateClusterCentroid(
                        cluster.id,
                        embedding,
                        cluster.questionCount,
                        cluster.centroid
                    );

                    console.log(`Question associee au cluster ${cluster.id} (similarite: ${similarity.toFixed(4)})`);
                } else {
                    // Cree un nouveau cluster
                    console.log(
                        `Similarite insuffisante (${match.similarity.toFixed(4)} < ${ClusteringConfig.SIMILARITY_THRESHOLD}), nouveau cluster`
                    );
                    cluster = await createNewCluster(trimmedText, embedding);
                    isNewCluster = true;
                    similarity = 1;
                }
            } else {
                // Aucun match trouvé (cas rare mais possible)
                console.log('Aucun match trouvé, création nouveau cluster');
                cluster = await createNewCluster(trimmedText, embedding);
                isNewCluster = true;
                similarity = 1;
            }
        }

        // 6. Sauvegarde la question AVEC PAYS ET LANGUE
        const savedQuestion = await saveQuestion(
            trimmedText,
            normalizedText,
            cluster.id,
            similarity,
            country,
            language
        );

        // 7. Sauvegarde l'embedding
        await saveEmbedding(savedQuestion.id, embedding);

        // 8. Cree le mapping question-cluster
        await createClusterMapping(savedQuestion.id, cluster.id, similarity);

        // 9. Met a jour les statistiques
        await updateDailyStats(isNewCluster, similarity);
        await updateClusterStats(cluster.id, similarity);

        return {
            success: true,
            question: {
                id: savedQuestion.id,
                text: trimmedText,
                normalizedText: normalizedText,
                createdAt: savedQuestion.created_at
            },
            cluster: {
                id: cluster.id,
                representativeText: cluster.representativeText,
                questionCount: cluster.questionCount + (isNewCluster ? 0 : 1),
                isNew: isNewCluster
            },
            similarity: similarity,
            threshold: ClusteringConfig.SIMILARITY_THRESHOLD
        };
    } catch (error) {
        console.error('Erreur lors du traitement de la question:', error);
        throw error;
    }
}

/**
 * Recupere les clusters les plus populaires
 * @param {number} limit - Nombre max de clusters
 * @returns {Promise<Array>} Liste des top clusters
 */
export async function getTopClusters(limit = ClusteringConfig.DEFAULT_TOP_CLUSTERS) {
    const result = await query(`
        SELECT
            qc.id,
            qc.representative_text,
            qc.question_count,
            qc.created_at,
            qc.last_activity_at,
            (
                SELECT COUNT(*)
                FROM user_questions uq
                WHERE uq.cluster_id = qc.id
                  AND uq.created_at >= CURRENT_DATE
            ) as questions_today
        FROM question_clusters qc
        WHERE qc.is_active = TRUE
        ORDER BY qc.question_count DESC
        LIMIT $1
    `, [limit]);

    return result.rows.map(row => ({
        id: row.id,
        representativeText: row.representative_text,
        questionCount: row.question_count,
        questionsToday: parseInt(row.questions_today),
        createdAt: row.created_at,
        lastActivityAt: row.last_activity_at
    }));
}

/**
 * Recupere les questions d'un cluster
 * @param {string} clusterId - ID du cluster
 * @param {number} limit - Nombre max de questions
 * @param {number} offset - Pagination offset
 * @returns {Promise<Object>} Questions et informations du cluster
 */
export async function getClusterQuestions(clusterId, limit = 50, offset = 0) {
    // Verifie que le cluster existe
    const clusterResult = await query(`
        SELECT
            id,
            representative_text,
            question_count,
            created_at,
            last_activity_at
        FROM question_clusters
        WHERE id = $1 AND is_active = TRUE
    `, [clusterId]);

    if (clusterResult.rows.length === 0) {
        throw new Error('Cluster non trouve');
    }

    const cluster = clusterResult.rows[0];

    // Recupere les questions
    const questionsResult = await query(`
        SELECT
            id,
            question_text,
            similarity_score,
            created_at
        FROM user_questions
        WHERE cluster_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
    `, [clusterId, limit, offset]);

    return {
        cluster: {
            id: cluster.id,
            representativeText: cluster.representative_text,
            questionCount: cluster.question_count,
            createdAt: cluster.created_at,
            lastActivityAt: cluster.last_activity_at
        },
        questions: questionsResult.rows.map(row => ({
            id: row.id,
            text: row.question_text,
            similarityScore: row.similarity_score,
            createdAt: row.created_at
        })),
        pagination: {
            limit,
            offset,
            total: cluster.question_count
        }
    };
}

/**
 * Recupere les statistiques quotidiennes
 * @param {number} days - Nombre de jours a recuperer
 * @returns {Promise<Array>} Statistiques par jour
 */
export async function getDailyStats(days = 30) {
    const result = await query(`
        SELECT
            stat_date,
            total_questions,
            new_clusters,
            existing_cluster_matches,
            avg_similarity
        FROM daily_stats
        ORDER BY stat_date DESC
        LIMIT $1
    `, [days]);

    return result.rows.map(row => ({
        date: row.stat_date,
        totalQuestions: row.total_questions,
        newClusters: row.new_clusters,
        existingClusterMatches: row.existing_cluster_matches,
        avgSimilarity: row.avg_similarity
    }));
}

/**
 * Recupere un resume global des statistiques
 * @returns {Promise<Object>} Resume statistique
 */
export async function getGlobalStats() {
    const result = await query(`
        SELECT
            (SELECT COUNT(*) FROM user_questions) as total_questions,
            (SELECT COUNT(*) FROM question_clusters WHERE is_active = TRUE) as total_clusters,
            (SELECT AVG(question_count) FROM question_clusters WHERE is_active = TRUE) as avg_questions_per_cluster,
            (SELECT MAX(question_count) FROM question_clusters WHERE is_active = TRUE) as max_questions_in_cluster,
            (SELECT COUNT(*) FROM user_questions WHERE created_at >= CURRENT_DATE) as questions_today,
            (SELECT AVG(similarity_score) FROM user_questions WHERE similarity_score IS NOT NULL) as overall_avg_similarity
    `);

    const stats = result.rows[0];

    return {
        totalQuestions: parseInt(stats.total_questions),
        totalClusters: parseInt(stats.total_clusters),
        avgQuestionsPerCluster: parseFloat(stats.avg_questions_per_cluster) || 0,
        maxQuestionsInCluster: parseInt(stats.max_questions_in_cluster) || 0,
        questionsToday: parseInt(stats.questions_today),
        overallAvgSimilarity: parseFloat(stats.overall_avg_similarity) || 0
    };
}

/**
 * Recupere les clusters les plus populaires sur une periode donnee
 * @param {number} days - Nombre de jours a considerer
 * @param {number} limit - Nombre max de clusters
 * @returns {Promise<Array>} Liste des top clusters sur la periode
 */
export async function getTopClustersByPeriod(days = 7, limit = 3) {
    const result = await query(`
        SELECT
            qc.id,
            qc.representative_text,
            qc.question_count as total_count,
            qc.created_at,
            qc.last_activity_at,
            COUNT(uq.id) as period_count
        FROM question_clusters qc
        INNER JOIN user_questions uq ON uq.cluster_id = qc.id
        WHERE qc.is_active = TRUE
          AND uq.created_at >= CURRENT_DATE - INTERVAL '1 day' * $1
        GROUP BY qc.id
        ORDER BY period_count DESC
        LIMIT $2
    `, [days, limit]);

    return result.rows.map(row => ({
        id: row.id,
        representativeText: row.representative_text,
        totalCount: parseInt(row.total_count),
        periodCount: parseInt(row.period_count),
        createdAt: row.created_at,
        lastActivityAt: row.last_activity_at
    }));
}

/**
 * Recherche des questions similaires a un texte donne
 * @param {string} searchText - Texte a rechercher
 * @param {number} limit - Nombre max de resultats
 * @returns {Promise<Array>} Questions similaires avec scores
 */
export async function searchSimilarQuestions(searchText, limit = 10) {
    // Genere l'embedding du texte recherche
    const searchEmbedding = await generateEmbedding(searchText);
    const embeddingStr = vectorToPostgres(searchEmbedding);

    // Recherche par similarite cosinus avec pgvector
    const result = await query(`
        SELECT
            uq.id,
            uq.question_text,
            uq.cluster_id,
            qc.representative_text as cluster_representative,
            1 - (qe.embedding <=> $1::vector) as similarity
        FROM user_questions uq
        JOIN question_embeddings qe ON qe.question_id = uq.id
        LEFT JOIN question_clusters qc ON qc.id = uq.cluster_id
        ORDER BY qe.embedding <=> $1::vector
        LIMIT $2
    `, [embeddingStr, limit]);

    return result.rows.map(row => ({
        id: row.id,
        text: row.question_text,
        clusterId: row.cluster_id,
        clusterRepresentative: row.cluster_representative,
        similarity: row.similarity
    }));
}

/**
 * Fusionne deux clusters
 * @param {string} sourceClusterId - Cluster source (sera desactive)
 * @param {string} targetClusterId - Cluster cible (conserve)
 * @returns {Promise<Object>} Resultat de la fusion
 */
export async function mergeClusters(sourceClusterId, targetClusterId) {
    // Deplace toutes les questions vers le cluster cible
    await query(`
        UPDATE user_questions
        SET cluster_id = $2
        WHERE cluster_id = $1
    `, [sourceClusterId, targetClusterId]);

    // Met a jour le mapping
    await query(`
        UPDATE question_cluster_map
        SET cluster_id = $2, is_current = FALSE
        WHERE cluster_id = $1 AND is_current = TRUE
    `, [sourceClusterId, targetClusterId]);

    // Desactive le cluster source
    await query(`
        UPDATE question_clusters
        SET is_active = FALSE
        WHERE id = $1
    `, [sourceClusterId]);

    // Recalcule le compteur du cluster cible
    const countResult = await query(`
        SELECT COUNT(*) as count
        FROM user_questions
        WHERE cluster_id = $1
    `, [targetClusterId]);

    await query(`
        UPDATE question_clusters
        SET question_count = $2
        WHERE id = $1
    `, [targetClusterId, countResult.rows[0].count]);

    invalidateCache();

    return {
        success: true,
        sourceClusterId,
        targetClusterId,
        mergedQuestions: parseInt(countResult.rows[0].count)
    };
}

export default {
    processQuestion,
    getTopClusters,
    getTopClustersByPeriod,
    getClusterQuestions,
    getDailyStats,
    getGlobalStats,
    searchSimilarQuestions,
    mergeClusters,
    invalidateCache
};