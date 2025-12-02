import { Pool, neonConfig } from '@neondatabase/serverless'; // Ajout de neonConfig ici
import dotenv from 'dotenv';
import ws from 'ws';

dotenv.config();

neonConfig.webSocketConstructor = ws;

// Vérification de sécurité pour éviter les crashs silencieux
if (!process.env.DATABASE_URL) {
  console.error("🔴 ERREUR : La variable DATABASE_URL est manquante dans le .env");
}

const pool = new Pool({
  // 1. On utilise l'URL complète de Neon
  connectionString: process.env.DATABASE_URL,
  
  ssl: {
    rejectUnauthorized: false 
  },

  // Options de performance
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, 
});

pool.on('error', (err) => {
  console.error('❌ Erreur inattendue sur le client PostgreSQL', err);
  process.exit(-1);
});

console.log("🔌 Tentative de connexion à la BDD (SSL activé)...");

export const query = async (text, params) => {
  const start = Date.now();

  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    return res;
  } catch (error) {
    console.error('❌ Erreur de requête', { text, error: error.message });
    throw error;
  }
};

export default pool;