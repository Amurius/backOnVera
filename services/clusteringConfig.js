/**
 * Configuration centralisee pour le systeme de clustering semantique
 * Toutes les constantes et parametres sont definis ici
 */

import dotenv from 'dotenv';
dotenv.config();

export const ClusteringConfig = {
    // ============================================
    // PARAMETRES DE SIMILARITE
    // ============================================

    // Seuil minimum de similarite pour associer a un cluster existant
    // Valeur entre 0 et 1 (0.80 = 80% de similarite)
    SIMILARITY_THRESHOLD: parseFloat(process.env.CLUSTERING_SIMILARITY_THRESHOLD) || 0.80,

    // Seuil de haute confiance (pour logs/analytics)
    HIGH_CONFIDENCE_THRESHOLD: parseFloat(process.env.CLUSTERING_HIGH_CONFIDENCE) || 0.90,

    // ============================================
    // PARAMETRES DU MODELE D'EMBEDDINGS
    // ============================================

    // Modele Xenova/Transformers a utiliser
    // all-MiniLM-L6-v2 : rapide, 384 dimensions, multilingue
    // all-mpnet-base-v2 : meilleure qualite, 768 dimensions, plus lent
    EMBEDDING_MODEL: process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2',

    // Dimension des vecteurs (doit correspondre au modele)
    EMBEDDING_DIMENSION: parseInt(process.env.EMBEDDING_DIMENSION) || 384,

    // Timeout pour le chargement du modele (ms)
    MODEL_LOAD_TIMEOUT: parseInt(process.env.MODEL_LOAD_TIMEOUT) || 60000,

    // ============================================
    // PARAMETRES DE NORMALISATION DU TEXTE
    // ============================================

    // Longueur minimale d'une question valide
    MIN_QUESTION_LENGTH: parseInt(process.env.MIN_QUESTION_LENGTH) || 3,

    // Longueur maximale d'une question (tokens)
    MAX_QUESTION_LENGTH: parseInt(process.env.MAX_QUESTION_LENGTH) || 512,

    // ============================================
    // PARAMETRES DE CACHE
    // ============================================

    // Duree de cache des clusters en memoire (ms)
    CLUSTER_CACHE_TTL: parseInt(process.env.CLUSTER_CACHE_TTL) || 300000, // 5 minutes

    // Nombre max de clusters en cache
    MAX_CACHED_CLUSTERS: parseInt(process.env.MAX_CACHED_CLUSTERS) || 1000,

    // ============================================
    // PARAMETRES DE BATCH PROCESSING
    // ============================================

    // Taille de batch pour le traitement des questions en attente
    BATCH_SIZE: parseInt(process.env.CLUSTERING_BATCH_SIZE) || 50,

    // Intervalle entre les batches (ms)
    BATCH_INTERVAL: parseInt(process.env.CLUSTERING_BATCH_INTERVAL) || 5000,

    // ============================================
    // PARAMETRES DE MISE A JOUR DU CENTROIDE
    // ============================================

    // Methode de calcul du centroide: 'average' | 'weighted' | 'first'
    CENTROID_UPDATE_METHOD: process.env.CENTROID_UPDATE_METHOD || 'average',

    // ============================================
    // PARAMETRES DE STATISTIQUES
    // ============================================

    // Nombre de top clusters a retourner par defaut
    DEFAULT_TOP_CLUSTERS: parseInt(process.env.DEFAULT_TOP_CLUSTERS) || 10,

    // Nombre max de questions a retourner par requete
    MAX_QUESTIONS_PER_REQUEST: parseInt(process.env.MAX_QUESTIONS_PER_REQUEST) || 100,

    // ============================================
    // BASE DE DONNEES
    // ============================================

    // Timeout pour les transactions (ms)
    TRANSACTION_TIMEOUT: parseInt(process.env.DB_TRANSACTION_TIMEOUT) || 30000,

    // Nombre max de tentatives en cas d'erreur
    MAX_RETRIES: parseInt(process.env.DB_MAX_RETRIES) || 3,

    // Delai entre les tentatives (ms)
    RETRY_DELAY: parseInt(process.env.DB_RETRY_DELAY) || 1000
};

/**
 * Valide la configuration au demarrage
 * @throws {Error} Si la configuration est invalide
 */
export function validateConfig() {
    const errors = [];

    if (ClusteringConfig.SIMILARITY_THRESHOLD < 0 || ClusteringConfig.SIMILARITY_THRESHOLD > 1) {
        errors.push('SIMILARITY_THRESHOLD doit etre entre 0 et 1');
    }

    if (ClusteringConfig.EMBEDDING_DIMENSION <= 0) {
        errors.push('EMBEDDING_DIMENSION doit etre positif');
    }

    if (ClusteringConfig.MIN_QUESTION_LENGTH < 1) {
        errors.push('MIN_QUESTION_LENGTH doit etre au moins 1');
    }

    if (errors.length > 0) {
        throw new Error(`Configuration invalide:\n${errors.join('\n')}`);
    }

    console.log('Configuration du clustering validee:');
    console.log(`  - Seuil de similarite: ${ClusteringConfig.SIMILARITY_THRESHOLD}`);
    console.log(`  - Modele: ${ClusteringConfig.EMBEDDING_MODEL}`);
    console.log(`  - Dimension: ${ClusteringConfig.EMBEDDING_DIMENSION}`);

    return true;
}

export default ClusteringConfig;
