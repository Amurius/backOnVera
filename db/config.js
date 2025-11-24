import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Vérification de sécurité
if (!process.env.DATABASE_URL) {
  console.error("🔴 ERREUR : La variable DATABASE_URL est manquante dans le .env");
}

const pool = new Pool({
  // 1. On utilise l'URL complète de Neon
  connectionString: process.env.DATABASE_URL,
  
  // 2. INDISPENSABLE POUR NEON : On active le SSL
  ssl: {
    rejectUnauthorized: false 
  },

  // Options de performance (tu peux garder tes anciens réglages)
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // J'ai augmenté un peu pour le Cloud
});

pool.on('error', (err) => {
  console.error('❌ Erreur inattendue sur le client PostgreSQL', err);
  process.exit(-1);
});

// Petit log au démarrage pour être sûr
console.log("🔌 Tentative de connexion à la BDD (SSL activé)...");

export const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    // On garde ton log de performance, c'est très bien !
    console.log('✅ Requête exécutée', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('❌ Erreur de requête', error);
    throw error;
  }
};

export default pool;