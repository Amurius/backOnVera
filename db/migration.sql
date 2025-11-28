-- Migration pour créer la base de données sondage_db
-- Exécuter ce fichier avec: psql -U postgres -f migration.sql

-- Créer la base de données (si elle n'existe pas)
-- Décommenter si vous voulez créer la base automatiquement
-- CREATE DATABASE sondage_db;

-- Se connecter à la base de données
-- \c sondage_db

-- Extension pour générer des UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================
-- TABLES
-- ==============================================

-- Table users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  role VARCHAR(50) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table surveys
CREATE TABLE IF NOT EXISTS surveys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  created_by UUID NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_surveys_created_by FOREIGN KEY (created_by)
    REFERENCES users(id) ON DELETE CASCADE
);

-- Table questions
CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  survey_id UUID NOT NULL,
  question_text TEXT NOT NULL,
  question_type VARCHAR(100) NOT NULL,
  options JSONB,
  is_required BOOLEAN DEFAULT false,
  order_index INTEGER,
  CONSTRAINT fk_questions_survey_id FOREIGN KEY (survey_id)
    REFERENCES surveys(id) ON DELETE CASCADE
);

-- Table survey_responses
CREATE TABLE IF NOT EXISTS survey_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  survey_id UUID NOT NULL,
  user_id UUID NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_survey_responses_survey_id FOREIGN KEY (survey_id)
    REFERENCES surveys(id) ON DELETE CASCADE,
  CONSTRAINT fk_survey_responses_user_id FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE
);

-- Table question_responses
CREATE TABLE IF NOT EXISTS question_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  survey_response_id UUID NOT NULL,
  question_id UUID NOT NULL,
  answer TEXT NOT NULL,
  CONSTRAINT fk_question_responses_survey_response_id FOREIGN KEY (survey_response_id)
    REFERENCES survey_responses(id) ON DELETE CASCADE,
  CONSTRAINT fk_question_responses_question_id FOREIGN KEY (question_id)
    REFERENCES questions(id) ON DELETE CASCADE
);

-- Table video_analyses
CREATE TABLE IF NOT EXISTS video_analyses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  video_url TEXT,
  audio_transcription TEXT,
  video_analysis TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_video_analyses_user_id FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE
);

-- Table ocr_analyses
CREATE TABLE IF NOT EXISTS ocr_analyses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  image_url TEXT,
  extracted_text TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ocr_analyses_user_id FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE
);

-- Table chat_messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  content_type VARCHAR(20) DEFAULT 'text',
  file_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_chat_messages_user_id FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE
);

-- ==============================================
-- INDEX
-- ==============================================

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_surveys_created_by ON surveys(created_by);
CREATE INDEX IF NOT EXISTS idx_surveys_is_active ON surveys(is_active);
CREATE INDEX IF NOT EXISTS idx_questions_survey_id ON questions(survey_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_survey_id ON survey_responses(survey_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_user_id ON survey_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_question_responses_survey_response_id ON question_responses(survey_response_id);
CREATE INDEX IF NOT EXISTS idx_question_responses_question_id ON question_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_video_analyses_user_id ON video_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_ocr_analyses_user_id ON ocr_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id);

-- ==============================================
-- FONCTIONS ET TRIGGERS
-- ==============================================

-- Fonction pour mettre à jour automatiquement le champ updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Trigger pour users
CREATE TRIGGER trigger_update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger pour surveys
CREATE TRIGGER trigger_update_surveys_updated_at
  BEFORE UPDATE ON surveys
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ==============================================
-- FIN DE LA MIGRATION
-- ==============================================
