-- ============================================================
-- MIGRATION : SYSTEME DE CLUSTERING SEMANTIQUE DES QUESTIONS
-- ============================================================
-- Ce script cree les tables necessaires pour regrouper les questions
-- par similarite semantique en utilisant des embeddings vectoriels.
-- Compatible avec PostgreSQL/Neon avec extension pgvector.
-- ============================================================

-- ==============================================
-- EXTENSION PGVECTOR (OBLIGATOIRE)
-- ==============================================
-- pgvector permet le stockage et la recherche de vecteurs
-- Dimension par defaut: 384 (modele all-MiniLM-L6-v2)

CREATE EXTENSION IF NOT EXISTS vector;

-- ==============================================
-- TABLE: user_questions
-- ==============================================
-- Stocke toutes les questions posees par les utilisateurs
-- Anonyme: pas de user_id

CREATE TABLE IF NOT EXISTS user_questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_text TEXT NOT NULL,
    normalized_text TEXT,
    cluster_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE,
    similarity_score FLOAT
);

COMMENT ON TABLE user_questions IS 'Questions anonymes posees par les utilisateurs';
COMMENT ON COLUMN user_questions.question_text IS 'Texte original de la question';
COMMENT ON COLUMN user_questions.normalized_text IS 'Texte normalise (minuscules, sans accents)';
COMMENT ON COLUMN user_questions.cluster_id IS 'Reference vers le cluster associe';
COMMENT ON COLUMN user_questions.similarity_score IS 'Score de similarite avec le cluster';

-- ==============================================
-- TABLE: question_clusters
-- ==============================================
-- Represente un groupe de questions semantiquement similaires

CREATE TABLE IF NOT EXISTS question_clusters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    representative_text TEXT NOT NULL,
    centroid VECTOR(384),
    question_count INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

COMMENT ON TABLE question_clusters IS 'Clusters de questions similaires';
COMMENT ON COLUMN question_clusters.representative_text IS 'Texte de la premiere question du cluster';
COMMENT ON COLUMN question_clusters.centroid IS 'Vecteur centroide du cluster (moyenne des embeddings)';
COMMENT ON COLUMN question_clusters.question_count IS 'Nombre total de questions dans ce cluster';

-- ==============================================
-- TABLE: question_embeddings
-- ==============================================
-- Stocke les vecteurs d'embeddings pour chaque question

CREATE TABLE IF NOT EXISTS question_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_id UUID NOT NULL UNIQUE,
    embedding VECTOR(384) NOT NULL,
    model_name VARCHAR(100) DEFAULT 'Xenova/all-MiniLM-L6-v2',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_question_embeddings_question_id
        FOREIGN KEY (question_id) REFERENCES user_questions(id) ON DELETE CASCADE
);

COMMENT ON TABLE question_embeddings IS 'Vecteurs embeddings des questions';
COMMENT ON COLUMN question_embeddings.embedding IS 'Vecteur de 384 dimensions';
COMMENT ON COLUMN question_embeddings.model_name IS 'Nom du modele utilise pour generer l embedding';

-- ==============================================
-- TABLE: question_cluster_map
-- ==============================================
-- Table de liaison many-to-many (pour historique ou re-clustering)

CREATE TABLE IF NOT EXISTS question_cluster_map (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_id UUID NOT NULL,
    cluster_id UUID NOT NULL,
    similarity_score FLOAT NOT NULL,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_current BOOLEAN DEFAULT TRUE,
    CONSTRAINT fk_qcm_question_id
        FOREIGN KEY (question_id) REFERENCES user_questions(id) ON DELETE CASCADE,
    CONSTRAINT fk_qcm_cluster_id
        FOREIGN KEY (cluster_id) REFERENCES question_clusters(id) ON DELETE CASCADE,
    CONSTRAINT uq_question_cluster_current
        UNIQUE (question_id, cluster_id, is_current)
);

COMMENT ON TABLE question_cluster_map IS 'Mapping questions vers clusters avec historique';

-- ==============================================
-- TABLE: cluster_stats
-- ==============================================
-- Statistiques agregees par jour pour analyse

CREATE TABLE IF NOT EXISTS cluster_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cluster_id UUID NOT NULL,
    stat_date DATE NOT NULL,
    question_count INTEGER DEFAULT 0,
    avg_similarity FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_cluster_stats_cluster_id
        FOREIGN KEY (cluster_id) REFERENCES question_clusters(id) ON DELETE CASCADE,
    CONSTRAINT uq_cluster_stat_date
        UNIQUE (cluster_id, stat_date)
);

COMMENT ON TABLE cluster_stats IS 'Statistiques journalieres par cluster';

-- ==============================================
-- TABLE: daily_stats
-- ==============================================
-- Statistiques globales journalieres

CREATE TABLE IF NOT EXISTS daily_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stat_date DATE NOT NULL UNIQUE,
    total_questions INTEGER DEFAULT 0,
    new_clusters INTEGER DEFAULT 0,
    existing_cluster_matches INTEGER DEFAULT 0,
    avg_similarity FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE daily_stats IS 'Statistiques globales journalieres';

-- ==============================================
-- AJOUT DES FOREIGN KEYS DIFFEREES
-- ==============================================
-- On ajoute la FK apres creation des deux tables

ALTER TABLE user_questions
    ADD CONSTRAINT fk_user_questions_cluster_id
    FOREIGN KEY (cluster_id) REFERENCES question_clusters(id) ON DELETE SET NULL;

-- ==============================================
-- INDEX POUR PERFORMANCE
-- ==============================================

-- Index pour recherche par cluster
CREATE INDEX IF NOT EXISTS idx_user_questions_cluster_id
    ON user_questions(cluster_id);

-- Index pour tri par date
CREATE INDEX IF NOT EXISTS idx_user_questions_created_at
    ON user_questions(created_at DESC);

-- Index pour les questions non traitees
CREATE INDEX IF NOT EXISTS idx_user_questions_unprocessed
    ON user_questions(processed_at) WHERE processed_at IS NULL;

-- Index pour recherche vectorielle (cosine similarity)
-- HNSW est plus rapide pour les recherches de similarite
CREATE INDEX IF NOT EXISTS idx_question_embeddings_vector
    ON question_embeddings USING hnsw (embedding vector_cosine_ops);

-- Index pour le centroide des clusters
CREATE INDEX IF NOT EXISTS idx_question_clusters_centroid
    ON question_clusters USING hnsw (centroid vector_cosine_ops);

-- Index pour les clusters actifs tries par count
CREATE INDEX IF NOT EXISTS idx_question_clusters_active_count
    ON question_clusters(question_count DESC) WHERE is_active = TRUE;

-- Index pour les stats par date
CREATE INDEX IF NOT EXISTS idx_cluster_stats_date
    ON cluster_stats(stat_date DESC);

CREATE INDEX IF NOT EXISTS idx_cluster_stats_cluster
    ON cluster_stats(cluster_id);

CREATE INDEX IF NOT EXISTS idx_daily_stats_date
    ON daily_stats(stat_date DESC);

-- Index pour le mapping actuel
CREATE INDEX IF NOT EXISTS idx_question_cluster_map_current
    ON question_cluster_map(question_id) WHERE is_current = TRUE;

-- ==============================================
-- TRIGGERS
-- ==============================================

-- Trigger pour mettre a jour updated_at sur question_clusters
CREATE OR REPLACE TRIGGER trigger_update_question_clusters_updated_at
    BEFORE UPDATE ON question_clusters
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger pour mettre a jour updated_at sur cluster_stats
CREATE OR REPLACE TRIGGER trigger_update_cluster_stats_updated_at
    BEFORE UPDATE ON cluster_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger pour mettre a jour updated_at sur daily_stats
CREATE OR REPLACE TRIGGER trigger_update_daily_stats_updated_at
    BEFORE UPDATE ON daily_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==============================================
-- FONCTION: update_cluster_on_question_insert
-- ==============================================
-- Met a jour automatiquement les compteurs du cluster

CREATE OR REPLACE FUNCTION update_cluster_on_question_insert()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.cluster_id IS NOT NULL THEN
        UPDATE question_clusters
        SET
            question_count = question_count + 1,
            last_activity_at = CURRENT_TIMESTAMP
        WHERE id = NEW.cluster_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_question_cluster_update
    AFTER INSERT OR UPDATE OF cluster_id ON user_questions
    FOR EACH ROW
    WHEN (NEW.cluster_id IS NOT NULL)
    EXECUTE FUNCTION update_cluster_on_question_insert();

-- ==============================================
-- FONCTION: decrement_cluster_count
-- ==============================================
-- Decremente le compteur quand une question est supprimee

CREATE OR REPLACE FUNCTION decrement_cluster_count()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.cluster_id IS NOT NULL THEN
        UPDATE question_clusters
        SET question_count = GREATEST(0, question_count - 1)
        WHERE id = OLD.cluster_id;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_question_delete_cluster_update
    BEFORE DELETE ON user_questions
    FOR EACH ROW
    EXECUTE FUNCTION decrement_cluster_count();

-- ==============================================
-- VUES UTILITAIRES
-- ==============================================

-- Vue pour les clusters les plus populaires
CREATE OR REPLACE VIEW v_top_clusters AS
SELECT
    qc.id,
    qc.representative_text,
    qc.question_count,
    qc.last_activity_at,
    qc.created_at
FROM question_clusters qc
WHERE qc.is_active = TRUE
ORDER BY qc.question_count DESC;

-- Vue pour les statistiques quotidiennes resumees
CREATE OR REPLACE VIEW v_daily_summary AS
SELECT
    ds.stat_date,
    ds.total_questions,
    ds.new_clusters,
    ds.existing_cluster_matches,
    ds.avg_similarity,
    (SELECT COUNT(*) FROM question_clusters WHERE is_active = TRUE) as total_active_clusters
FROM daily_stats ds
ORDER BY ds.stat_date DESC;

-- ==============================================
-- FIN DE LA MIGRATION
-- ==============================================
