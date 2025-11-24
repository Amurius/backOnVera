import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const runSetup = async () => {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    console.error("🔴 ERREUR : Pas de DATABASE_URL dans le .env !");
    return;
  }

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false } // Indispensable pour Neon
  });

  try {
    console.log("⏳ Connexion à Neon...");
    
    // LE SQL COMPLET ET À JOUR
    const sql = `
      -- 1. Nettoyage complet des anciennes tables (si elles existent)
      DROP TABLE IF EXISTS question_responses CASCADE;
      DROP TABLE IF EXISTS survey_responses CASCADE;
      DROP TABLE IF EXISTS questions CASCADE;
      DROP TABLE IF EXISTS surveys CASCADE;
      DROP TABLE IF EXISTS video_analyses CASCADE;
      DROP TABLE IF EXISTS ocr_analyses CASCADE;
      DROP TABLE IF EXISTS users CASCADE;

      -- 2. Extensions
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

      -- 3. Table Users (Avec Token Invitation & Password Optionnel)
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255), 
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        role VARCHAR(50) DEFAULT 'user',
        invitation_token VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- 4. Tables IA (Mission 1 & 3)
      CREATE TABLE ocr_analyses (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        image_url TEXT,
        extracted_text TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE video_analyses (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        video_url TEXT,
        audio_transcription TEXT,
        video_analysis TEXT,
        verdict VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- 5. Tables Sondages (Mission 2)
      CREATE TABLE surveys (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        created_by UUID REFERENCES users(id) ON DELETE CASCADE,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE questions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        survey_id UUID REFERENCES surveys(id) ON DELETE CASCADE,
        question_text TEXT NOT NULL,
        question_type VARCHAR(50) NOT NULL,
        options JSONB,
        is_required BOOLEAN DEFAULT false,
        order_index INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE survey_responses (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        survey_id UUID REFERENCES surveys(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE question_responses (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        survey_response_id UUID REFERENCES survey_responses(id) ON DELETE CASCADE,
        question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
        answer TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- 6. Optimisation
      CREATE INDEX idx_users_email ON users(email);
    `;

    console.log("🚀 Création des tables en cours...");
    await pool.query(sql);
    console.log("✅ SUCCÈS ! La base de données Vera est prête sur Neon.");

  } catch (err) {
    console.error("❌ ERREUR SQL :", err);
  } finally {
    await pool.end();
  }
};

runSetup();