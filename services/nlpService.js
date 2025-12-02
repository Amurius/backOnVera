/**
 * Service NLP pour la generation d'embeddings semantiques
 * Utilise @huggingface/transformers pour le traitement local
 */

import { pipeline, env } from '@huggingface/transformers';
import { ClusteringConfig } from './clusteringConfig.js';

// Configuration de l'environnement HuggingFace
env.cacheDir = './.cache/transformers';
env.allowLocalModels = true;

// Singleton pour le pipeline d'embeddings
let embeddingPipeline = null;
let isLoading = false;
let loadPromise = null;

/**
 * Initialise le pipeline d'embeddings
 * Utilise un pattern singleton pour eviter les chargements multiples
 * @returns {Promise<Pipeline>} Le pipeline initialise
 */
async function initializePipeline() {
    if (embeddingPipeline) {
        return embeddingPipeline;
    }

    if (isLoading) {
        return loadPromise;
    }

    isLoading = true;
    console.log(`Chargement du modele d'embeddings: ${ClusteringConfig.EMBEDDING_MODEL}...`);

    const startTime = Date.now();

    loadPromise = pipeline('feature-extraction', ClusteringConfig.EMBEDDING_MODEL, {
        quantized: true // Utilise la version quantifiee pour de meilleures performances
    });

    try {
        embeddingPipeline = await loadPromise;
        const loadTime = Date.now() - startTime;
        console.log(`Modele charge en ${loadTime}ms`);
        return embeddingPipeline;
    } catch (error) {
        isLoading = false;
        loadPromise = null;
        console.error('Erreur lors du chargement du modele:', error);
        throw new Error(`Impossible de charger le modele: ${error.message}`);
    }
}

/**
 * Normalise le texte avant le traitement
 * @param {string} text - Texte a normaliser
 * @returns {string} Texte normalise
 */
export function normalizeText(text) {
    if (!text || typeof text !== 'string') {
        return '';
    }

    return text
        // Supprime les espaces multiples
        .replace(/\s+/g, ' ')
        // Trim
        .trim()
        // Convertit en minuscules
        .toLowerCase()
        // Supprime les caracteres speciaux sauf ponctuation basique
        .replace(/[^\w\s\u00C0-\u024F.,!?'-]/g, '')
        // Normalise les accents (optionnel, garder les accents peut etre utile)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Genere un embedding vectoriel pour un texte donne
 * @param {string} text - Texte a transformer en vecteur
 * @returns {Promise<Float32Array>} Vecteur d'embedding normalise
 * @throws {Error} Si le texte est invalide ou le modele non disponible
 */
export async function generateEmbedding(text) {
    // Validation de l'entree
    if (!text || typeof text !== 'string') {
        throw new Error('Le texte doit etre une chaine non vide');
    }

    const normalizedText = normalizeText(text);

    if (normalizedText.length < ClusteringConfig.MIN_QUESTION_LENGTH) {
        throw new Error(`Le texte doit contenir au moins ${ClusteringConfig.MIN_QUESTION_LENGTH} caracteres`);
    }

    // Tronque si trop long
    const truncatedText = normalizedText.slice(0, ClusteringConfig.MAX_QUESTION_LENGTH);

    try {
        // Initialise le pipeline si necessaire
        const extractor = await initializePipeline();

        // Genere l'embedding
        const output = await extractor(truncatedText, {
            pooling: 'mean',      // Moyenne des tokens
            normalize: true        // Normalise le vecteur (norme L2 = 1)
        });

        // Extrait le vecteur comme Float32Array
        const embedding = output.data;

        // Verifie la dimension
        if (embedding.length !== ClusteringConfig.EMBEDDING_DIMENSION) {
            console.warn(
                `Dimension inattendue: ${embedding.length} au lieu de ${ClusteringConfig.EMBEDDING_DIMENSION}`
            );
        }

        return embedding;
    } catch (error) {
        console.error('Erreur lors de la generation de l\'embedding:', error);
        throw new Error(`Echec de la generation de l'embedding: ${error.message}`);
    }
}

/**
 * Calcule la similarite cosinus entre deux vecteurs
 * Formule: cos(theta) = (A . B) / (||A|| * ||B||)
 *
 * Note: Si les vecteurs sont deja normalises (norme = 1),
 * la similarite cosinus = produit scalaire
 *
 * @param {Float32Array|number[]} v1 - Premier vecteur
 * @param {Float32Array|number[]} v2 - Second vecteur
 * @returns {number} Similarite entre -1 et 1 (1 = identiques)
 * @throws {Error} Si les vecteurs sont invalides ou de dimensions differentes
 */
export function cosineSimilarity(v1, v2) {
    // Validation des entrees
    if (!v1 || !v2) {
        throw new Error('Les deux vecteurs doivent etre fournis');
    }

    if (v1.length !== v2.length) {
        throw new Error(`Dimensions incompatibles: ${v1.length} vs ${v2.length}`);
    }

    if (v1.length === 0) {
        throw new Error('Les vecteurs ne peuvent pas etre vides');
    }

    let dotProduct = 0;
    let normV1 = 0;
    let normV2 = 0;

    // Calcul en une seule passe pour la performance
    for (let i = 0; i < v1.length; i++) {
        const a = v1[i];
        const b = v2[i];
        dotProduct += a * b;
        normV1 += a * a;
        normV2 += b * b;
    }

    normV1 = Math.sqrt(normV1);
    normV2 = Math.sqrt(normV2);

    // Evite la division par zero
    if (normV1 === 0 || normV2 === 0) {
        return 0;
    }

    // Pour les vecteurs normalises, on peut simplifier a dotProduct
    // mais on garde le calcul complet pour robustesse
    const similarity = dotProduct / (normV1 * normV2);

    // Clamp entre -1 et 1 (erreurs d'arrondi)
    return Math.max(-1, Math.min(1, similarity));
}

/**
 * Calcule la distance euclidienne entre deux vecteurs
 * @param {Float32Array|number[]} v1 - Premier vecteur
 * @param {Float32Array|number[]} v2 - Second vecteur
 * @returns {number} Distance euclidienne (>= 0)
 */
export function euclideanDistance(v1, v2) {
    if (!v1 || !v2 || v1.length !== v2.length) {
        throw new Error('Vecteurs invalides ou de dimensions differentes');
    }

    let sum = 0;
    for (let i = 0; i < v1.length; i++) {
        const diff = v1[i] - v2[i];
        sum += diff * diff;
    }

    return Math.sqrt(sum);
}

/**
 * Calcule le centroide (moyenne) d'un ensemble de vecteurs
 * @param {Array<Float32Array|number[]>} vectors - Liste de vecteurs
 * @returns {Float32Array} Vecteur centroide normalise
 */
export function computeCentroid(vectors) {
    if (!vectors || vectors.length === 0) {
        throw new Error('La liste de vecteurs ne peut pas etre vide');
    }

    const dimension = vectors[0].length;
    const centroid = new Float32Array(dimension);

    // Somme de tous les vecteurs
    for (const vector of vectors) {
        if (vector.length !== dimension) {
            throw new Error('Tous les vecteurs doivent avoir la meme dimension');
        }
        for (let i = 0; i < dimension; i++) {
            centroid[i] += vector[i];
        }
    }

    // Moyenne
    const count = vectors.length;
    for (let i = 0; i < dimension; i++) {
        centroid[i] /= count;
    }

    // Normalisation L2
    let norm = 0;
    for (let i = 0; i < dimension; i++) {
        norm += centroid[i] * centroid[i];
    }
    norm = Math.sqrt(norm);

    if (norm > 0) {
        for (let i = 0; i < dimension; i++) {
            centroid[i] /= norm;
        }
    }

    return centroid;
}

/**
 * Met a jour un centroide avec un nouveau vecteur (moyenne incrementale)
 * Formule: new_centroid = (old_centroid * n + new_vector) / (n + 1)
 *
 * @param {Float32Array|number[]} currentCentroid - Centroide actuel
 * @param {Float32Array|number[]} newVector - Nouveau vecteur a integrer
 * @param {number} currentCount - Nombre actuel de vecteurs dans le cluster
 * @returns {Float32Array} Nouveau centroide normalise
 */
export function updateCentroid(currentCentroid, newVector, currentCount) {
    if (!currentCentroid || !newVector) {
        throw new Error('Centroide et nouveau vecteur requis');
    }

    if (currentCentroid.length !== newVector.length) {
        throw new Error('Dimensions incompatibles');
    }

    const dimension = currentCentroid.length;
    const newCentroid = new Float32Array(dimension);
    const newCount = currentCount + 1;

    // Moyenne incrementale
    for (let i = 0; i < dimension; i++) {
        newCentroid[i] = (currentCentroid[i] * currentCount + newVector[i]) / newCount;
    }

    // Normalisation L2
    let norm = 0;
    for (let i = 0; i < dimension; i++) {
        norm += newCentroid[i] * newCentroid[i];
    }
    norm = Math.sqrt(norm);

    if (norm > 0) {
        for (let i = 0; i < dimension; i++) {
            newCentroid[i] /= norm;
        }
    }

    return newCentroid;
}

/**
 * Convertit un vecteur en format PostgreSQL
 * @param {Float32Array|number[]} vector - Vecteur a convertir
 * @returns {string} Representation string pour pgvector '[0.1,0.2,...]'
 */
export function vectorToPostgres(vector) {
    if (!vector || vector.length === 0) {
        throw new Error('Vecteur invalide');
    }

    return `[${Array.from(vector).join(',')}]`;
}

/**
 * Convertit un vecteur PostgreSQL en Float32Array
 * @param {string|number[]} pgVector - Vecteur depuis PostgreSQL
 * @returns {Float32Array} Vecteur comme Float32Array
 */
export function postgresVectorToArray(pgVector) {
    if (!pgVector) {
        throw new Error('Vecteur PostgreSQL invalide');
    }

    // Si deja un array
    if (Array.isArray(pgVector)) {
        return new Float32Array(pgVector);
    }

    // Si string format '[0.1,0.2,...]'
    if (typeof pgVector === 'string') {
        const cleaned = pgVector.replace(/[\[\]]/g, '');
        const values = cleaned.split(',').map(parseFloat);
        return new Float32Array(values);
    }

    throw new Error('Format de vecteur non reconnu');
}

/**
 * Precharge le modele au demarrage de l'application
 * Appeler cette fonction dans server.js pour un demarrage plus rapide
 */
export async function preloadModel() {
    console.log('Prechargement du modele NLP...');
    try {
        await initializePipeline();
        console.log('Modele NLP pret');
        return true;
    } catch (error) {
        console.error('Echec du prechargement:', error);
        return false;
    }
}

/**
 * Genere des embeddings pour plusieurs textes en batch
 * Plus efficace que des appels individuels
 *
 * @param {string[]} texts - Liste de textes
 * @returns {Promise<Float32Array[]>} Liste d'embeddings
 */
export async function generateEmbeddingsBatch(texts) {
    if (!texts || texts.length === 0) {
        return [];
    }

    const extractor = await initializePipeline();
    const embeddings = [];

    for (const text of texts) {
        try {
            const normalized = normalizeText(text);
            if (normalized.length >= ClusteringConfig.MIN_QUESTION_LENGTH) {
                const output = await extractor(normalized, {
                    pooling: 'mean',
                    normalize: true
                });
                embeddings.push(output.data);
            } else {
                embeddings.push(null);
            }
        } catch (error) {
            console.error(`Erreur pour le texte "${text}":`, error);
            embeddings.push(null);
        }
    }

    return embeddings;
}

export default {
    generateEmbedding,
    generateEmbeddingsBatch,
    cosineSimilarity,
    euclideanDistance,
    computeCentroid,
    updateCentroid,
    normalizeText,
    vectorToPostgres,
    postgresVectorToArray,
    preloadModel
};
