/**
 * Controleur pour le systeme de clustering semantique
 * Gere les endpoints API pour les questions et clusters
 */

import {
    processQuestion,
    getTopClusters,
    getTopClustersByPeriod,
    getClusterQuestions,
    getDailyStats,
    getGlobalStats,
    searchSimilarQuestions,
    mergeClusters
} from '../services/clusteringService.js';
import { ClusteringConfig } from '../services/clusteringConfig.js';

/**
 * POST /questions
 * Soumet une nouvelle question pour traitement et clustering
 *
 * Body: { question: string }
 * Response: {
 *   success: boolean,
 *   question: { id, text, normalizedText, createdAt },
 *   cluster: { id, representativeText, questionCount, isNew },
 *   similarity: number,
 *   threshold: number
 * }
 */
export async function submitQuestion(req, res) {
    try {
        const { question } = req.body;

        // Validation de l'entree
        if (!question || typeof question !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Le champ "question" est requis et doit etre une chaine de caracteres'
            });
        }

        const trimmedQuestion = question.trim();

        if (trimmedQuestion.length < ClusteringConfig.MIN_QUESTION_LENGTH) {
            return res.status(400).json({
                success: false,
                error: `La question doit contenir au moins ${ClusteringConfig.MIN_QUESTION_LENGTH} caracteres`
            });
        }

        if (trimmedQuestion.length > ClusteringConfig.MAX_QUESTION_LENGTH) {
            return res.status(400).json({
                success: false,
                error: `La question ne doit pas depasser ${ClusteringConfig.MAX_QUESTION_LENGTH} caracteres`
            });
        }

        // Traitement de la question
        const result = await processQuestion(trimmedQuestion);

        return res.status(201).json(result);
    } catch (error) {
        console.error('Erreur lors de la soumission de la question:', error);
        return res.status(500).json({
            success: false,
            error: 'Erreur lors du traitement de la question',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

/**
 * GET /clusters/top
 * Recupere les clusters les plus populaires
 *
 * Query: { limit?: number }
 * Response: {
 *   success: boolean,
 *   clusters: Array<{
 *     id, representativeText, questionCount, questionsToday, createdAt, lastActivityAt
 *   }>
 * }
 */
export async function getTopClustersHandler(req, res) {
    try {
        let limit = parseInt(req.query.limit) || ClusteringConfig.DEFAULT_TOP_CLUSTERS;

        // Limite les resultats
        if (limit < 1) limit = 1;
        if (limit > 100) limit = 100;

        const clusters = await getTopClusters(limit);

        return res.status(200).json({
            success: true,
            count: clusters.length,
            clusters
        });
    } catch (error) {
        console.error('Erreur lors de la recuperation des top clusters:', error);
        return res.status(500).json({
            success: false,
            error: 'Erreur lors de la recuperation des clusters',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

/**
 * GET /clusters/trending
 * Recupere les clusters les plus populaires sur une periode donnee
 *
 * Query: { days?: number, limit?: number }
 * Response: {
 *   success: boolean,
 *   period: { days: number, startDate: string, endDate: string },
 *   clusters: Array<{
 *     id, representativeText, totalCount, periodCount, createdAt, lastActivityAt
 *   }>
 * }
 */
export async function getTrendingClustersHandler(req, res) {
    try {
        let days = parseInt(req.query.days) || 7;
        let limit = parseInt(req.query.limit) || 3;

        // Limites
        if (days < 1) days = 1;
        if (days > 90) days = 90;
        if (limit < 1) limit = 1;
        if (limit > 20) limit = 20;

        const clusters = await getTopClustersByPeriod(days, limit);

        // Calcul des dates de la periode
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        return res.status(200).json({
            success: true,
            period: {
                days,
                startDate: startDate.toISOString().split('T')[0],
                endDate: endDate.toISOString().split('T')[0]
            },
            count: clusters.length,
            clusters
        });
    } catch (error) {
        console.error('Erreur lors de la recuperation des clusters trending:', error);
        return res.status(500).json({
            success: false,
            error: 'Erreur lors de la recuperation des clusters',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

/**
 * GET /clusters/:id/questions
 * Recupere les questions d'un cluster specifique
 *
 * Params: { id: string }
 * Query: { limit?: number, offset?: number }
 * Response: {
 *   success: boolean,
 *   cluster: { id, representativeText, questionCount, createdAt, lastActivityAt },
 *   questions: Array<{ id, text, similarityScore, createdAt }>,
 *   pagination: { limit, offset, total }
 * }
 */
export async function getClusterQuestionsHandler(req, res) {
    try {
        const { id } = req.params;

        // Validation de l'UUID
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!id || !uuidRegex.test(id)) {
            return res.status(400).json({
                success: false,
                error: 'ID de cluster invalide'
            });
        }

        let limit = parseInt(req.query.limit) || 50;
        let offset = parseInt(req.query.offset) || 0;

        // Limites
        if (limit < 1) limit = 1;
        if (limit > ClusteringConfig.MAX_QUESTIONS_PER_REQUEST) {
            limit = ClusteringConfig.MAX_QUESTIONS_PER_REQUEST;
        }
        if (offset < 0) offset = 0;

        const result = await getClusterQuestions(id, limit, offset);

        return res.status(200).json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('Erreur lors de la recuperation des questions du cluster:', error);

        if (error.message === 'Cluster non trouve') {
            return res.status(404).json({
                success: false,
                error: 'Cluster non trouve'
            });
        }

        return res.status(500).json({
            success: false,
            error: 'Erreur lors de la recuperation des questions',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

/**
 * GET /stats/daily
 * Recupere les statistiques quotidiennes
 *
 * Query: { days?: number }
 * Response: {
 *   success: boolean,
 *   stats: Array<{
 *     date, totalQuestions, newClusters, existingClusterMatches, avgSimilarity
 *   }>
 * }
 */
export async function getDailyStatsHandler(req, res) {
    try {
        let days = parseInt(req.query.days) || 30;

        if (days < 1) days = 1;
        if (days > 365) days = 365;

        const stats = await getDailyStats(days);

        return res.status(200).json({
            success: true,
            days,
            stats
        });
    } catch (error) {
        console.error('Erreur lors de la recuperation des statistiques:', error);
        return res.status(500).json({
            success: false,
            error: 'Erreur lors de la recuperation des statistiques',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

/**
 * GET /stats/global
 * Recupere les statistiques globales
 *
 * Response: {
 *   success: boolean,
 *   stats: {
 *     totalQuestions, totalClusters, avgQuestionsPerCluster,
 *     maxQuestionsInCluster, questionsToday, overallAvgSimilarity
 *   }
 * }
 */
export async function getGlobalStatsHandler(req, res) {
    try {
        const stats = await getGlobalStats();

        return res.status(200).json({
            success: true,
            stats
        });
    } catch (error) {
        console.error('Erreur lors de la recuperation des statistiques globales:', error);
        return res.status(500).json({
            success: false,
            error: 'Erreur lors de la recuperation des statistiques',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

/**
 * POST /questions/search
 * Recherche des questions similaires
 *
 * Body: { query: string, limit?: number }
 * Response: {
 *   success: boolean,
 *   query: string,
 *   results: Array<{ id, text, clusterId, clusterRepresentative, similarity }>
 * }
 */
export async function searchQuestionsHandler(req, res) {
    try {
        const { query: searchQuery, limit } = req.body;

        if (!searchQuery || typeof searchQuery !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Le champ "query" est requis'
            });
        }

        const trimmedQuery = searchQuery.trim();
        if (trimmedQuery.length < ClusteringConfig.MIN_QUESTION_LENGTH) {
            return res.status(400).json({
                success: false,
                error: `La requete doit contenir au moins ${ClusteringConfig.MIN_QUESTION_LENGTH} caracteres`
            });
        }

        let resultLimit = parseInt(limit) || 10;
        if (resultLimit < 1) resultLimit = 1;
        if (resultLimit > 50) resultLimit = 50;

        const results = await searchSimilarQuestions(trimmedQuery, resultLimit);

        return res.status(200).json({
            success: true,
            query: trimmedQuery,
            count: results.length,
            results
        });
    } catch (error) {
        console.error('Erreur lors de la recherche:', error);
        return res.status(500).json({
            success: false,
            error: 'Erreur lors de la recherche',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

/**
 * POST /clusters/merge
 * Fusionne deux clusters (admin seulement)
 *
 * Body: { sourceClusterId: string, targetClusterId: string }
 * Response: {
 *   success: boolean,
 *   sourceClusterId, targetClusterId, mergedQuestions
 * }
 */
export async function mergeClustersHandler(req, res) {
    try {
        const { sourceClusterId, targetClusterId } = req.body;

        // Validation des UUIDs
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

        if (!sourceClusterId || !uuidRegex.test(sourceClusterId)) {
            return res.status(400).json({
                success: false,
                error: 'sourceClusterId invalide'
            });
        }

        if (!targetClusterId || !uuidRegex.test(targetClusterId)) {
            return res.status(400).json({
                success: false,
                error: 'targetClusterId invalide'
            });
        }

        if (sourceClusterId === targetClusterId) {
            return res.status(400).json({
                success: false,
                error: 'Les clusters source et cible doivent etre differents'
            });
        }

        const result = await mergeClusters(sourceClusterId, targetClusterId);

        return res.status(200).json(result);
    } catch (error) {
        console.error('Erreur lors de la fusion des clusters:', error);
        return res.status(500).json({
            success: false,
            error: 'Erreur lors de la fusion des clusters',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

/**
 * GET /clusters/:id
 * Recupere les details d'un cluster
 *
 * Params: { id: string }
 * Response: {
 *   success: boolean,
 *   cluster: { id, representativeText, questionCount, createdAt, lastActivityAt }
 * }
 */
export async function getClusterDetailsHandler(req, res) {
    try {
        const { id } = req.params;

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!id || !uuidRegex.test(id)) {
            return res.status(400).json({
                success: false,
                error: 'ID de cluster invalide'
            });
        }

        const result = await getClusterQuestions(id, 1, 0);

        return res.status(200).json({
            success: true,
            cluster: result.cluster
        });
    } catch (error) {
        if (error.message === 'Cluster non trouve') {
            return res.status(404).json({
                success: false,
                error: 'Cluster non trouve'
            });
        }

        console.error('Erreur:', error);
        return res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
}

/**
 * GET /health
 * Verifie l'etat du service de clustering
 */
export async function healthCheck(req, res) {
    try {
        const stats = await getGlobalStats();

        return res.status(200).json({
            success: true,
            status: 'healthy',
            service: 'clustering',
            config: {
                similarityThreshold: ClusteringConfig.SIMILARITY_THRESHOLD,
                embeddingModel: ClusteringConfig.EMBEDDING_MODEL,
                embeddingDimension: ClusteringConfig.EMBEDDING_DIMENSION
            },
            stats: {
                totalClusters: stats.totalClusters,
                totalQuestions: stats.totalQuestions
            }
        });
    } catch (error) {
        return res.status(503).json({
            success: false,
            status: 'unhealthy',
            error: error.message
        });
    }
}

export default {
    submitQuestion,
    getTopClustersHandler,
    getTrendingClustersHandler,
    getClusterQuestionsHandler,
    getClusterDetailsHandler,
    getDailyStatsHandler,
    getGlobalStatsHandler,
    searchQuestionsHandler,
    mergeClustersHandler,
    healthCheck
};
