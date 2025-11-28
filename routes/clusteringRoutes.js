/**
 * Routes pour le systeme de clustering semantique
 *
 * Endpoints disponibles:
 *
 * POST   /api/clustering/questions          - Soumettre une nouvelle question
 * POST   /api/clustering/questions/search   - Rechercher des questions similaires
 * GET    /api/clustering/clusters/top       - Top clusters par nombre de questions
 * GET    /api/clustering/clusters/trending  - Top 3 clusters sur 7 jours (configurable)
 * GET    /api/clustering/clusters/:id       - Details d'un cluster
 * GET    /api/clustering/clusters/:id/questions - Questions d'un cluster
 * POST   /api/clustering/clusters/merge     - Fusionner deux clusters
 * GET    /api/clustering/stats/daily        - Statistiques quotidiennes
 * GET    /api/clustering/stats/global       - Statistiques globales
 * GET    /api/clustering/health             - Health check du service
 */

import { Router } from 'express';
import {
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
} from '../controllers/clusteringController.js';

const router = Router();

// ============================================
// ROUTES QUESTIONS
// ============================================

/**
 * @route   POST /api/clustering/questions
 * @desc    Soumet une nouvelle question pour traitement et clustering
 * @access  Public
 * @body    { question: string }
 * @returns {
 *   success: boolean,
 *   question: { id, text, normalizedText, createdAt },
 *   cluster: { id, representativeText, questionCount, isNew },
 *   similarity: number,
 *   threshold: number
 * }
 */
router.post('/questions', submitQuestion);

/**
 * @route   POST /api/clustering/questions/search
 * @desc    Recherche des questions semantiquement similaires
 * @access  Public
 * @body    { query: string, limit?: number }
 * @returns {
 *   success: boolean,
 *   query: string,
 *   count: number,
 *   results: Array<{ id, text, clusterId, clusterRepresentative, similarity }>
 * }
 */
router.post('/questions/search', searchQuestionsHandler);

// ============================================
// ROUTES CLUSTERS
// ============================================

/**
 * @route   GET /api/clustering/clusters/top
 * @desc    Recupere les clusters les plus populaires
 * @access  Public
 * @query   { limit?: number (1-100, default: 10) }
 * @returns {
 *   success: boolean,
 *   count: number,
 *   clusters: Array<{
 *     id, representativeText, questionCount, questionsToday, createdAt, lastActivityAt
 *   }>
 * }
 */
router.get('/clusters/top', getTopClustersHandler);

/**
 * @route   GET /api/clustering/clusters/trending
 * @desc    Recupere les questions les plus posees sur une periode (defaut: 7 jours, 3 resultats)
 * @access  Public
 * @query   { days?: number (1-90, default: 7), limit?: number (1-20, default: 3) }
 * @returns {
 *   success: boolean,
 *   period: { days, startDate, endDate },
 *   count: number,
 *   clusters: Array<{
 *     id, representativeText, totalCount, periodCount, createdAt, lastActivityAt
 *   }>
 * }
 */
router.get('/clusters/trending', getTrendingClustersHandler);

/**
 * @route   GET /api/clustering/clusters/:id
 * @desc    Recupere les details d'un cluster specifique
 * @access  Public
 * @params  { id: UUID }
 * @returns {
 *   success: boolean,
 *   cluster: { id, representativeText, questionCount, createdAt, lastActivityAt }
 * }
 */
router.get('/clusters/:id', getClusterDetailsHandler);

/**
 * @route   GET /api/clustering/clusters/:id/questions
 * @desc    Recupere les questions d'un cluster
 * @access  Public
 * @params  { id: UUID }
 * @query   { limit?: number (1-100), offset?: number }
 * @returns {
 *   success: boolean,
 *   cluster: { id, representativeText, questionCount, createdAt, lastActivityAt },
 *   questions: Array<{ id, text, similarityScore, createdAt }>,
 *   pagination: { limit, offset, total }
 * }
 */
router.get('/clusters/:id/questions', getClusterQuestionsHandler);

/**
 * @route   POST /api/clustering/clusters/merge
 * @desc    Fusionne deux clusters (operation administrative)
 * @access  Protected (admin recommande)
 * @body    { sourceClusterId: UUID, targetClusterId: UUID }
 * @returns {
 *   success: boolean,
 *   sourceClusterId: UUID,
 *   targetClusterId: UUID,
 *   mergedQuestions: number
 * }
 */
router.post('/clusters/merge', mergeClustersHandler);

// ============================================
// ROUTES STATISTIQUES
// ============================================

/**
 * @route   GET /api/clustering/stats/daily
 * @desc    Recupere les statistiques quotidiennes
 * @access  Public
 * @query   { days?: number (1-365, default: 30) }
 * @returns {
 *   success: boolean,
 *   days: number,
 *   stats: Array<{
 *     date, totalQuestions, newClusters, existingClusterMatches, avgSimilarity
 *   }>
 * }
 */
router.get('/stats/daily', getDailyStatsHandler);

/**
 * @route   GET /api/clustering/stats/global
 * @desc    Recupere les statistiques globales
 * @access  Public
 * @returns {
 *   success: boolean,
 *   stats: {
 *     totalQuestions, totalClusters, avgQuestionsPerCluster,
 *     maxQuestionsInCluster, questionsToday, overallAvgSimilarity
 *   }
 * }
 */
router.get('/stats/global', getGlobalStatsHandler);

// ============================================
// ROUTES SYSTEME
// ============================================

/**
 * @route   GET /api/clustering/health
 * @desc    Verifie l'etat du service de clustering
 * @access  Public
 * @returns {
 *   success: boolean,
 *   status: 'healthy' | 'unhealthy',
 *   service: 'clustering',
 *   config: { similarityThreshold, embeddingModel, embeddingDimension },
 *   stats: { totalClusters, totalQuestions }
 * }
 */
router.get('/health', healthCheck);

export default router;
