import { Pool, neonConfig } from '@neondatabase/serverless'; // 1. On ajoute neonConfig
import dotenv from 'dotenv';
import ws from 'ws'; // 2. On importe la librairie WebSocket

dotenv.config();

// 3. OBLIGATOIRE : On configure le WebSocket pour Node.js (Local & Render)
neonConfig.webSocketConstructor = ws;

// Vérification de sécurité pour éviter les crashs silencieux
if (!process.env.DATABASE_URL) {
  console.error("🔴 ERREUR : La variable DATABASE_URL est manquante dans le .env");
}

const pool = new Pool({
  // 1. On utilise l'URL complète de Neon (plus simple et plus sûr)
  connectionString: process.env.DATABASE_URL,
  
  // 2. INDISPENSABLE POUR NEON : On active le SSL
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

// Petit log au démarrage pour confirmer que tout va bien
console.log("🔌 Tentative de connexion à la BDD (SSL activé)...");

export const query = async (text, params) => {
  const start = Date.now();


 try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    // On garde le log de performance, c'est utile pour le debug
    console.log('✅ Requête exécutée', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('❌ Erreur de requête', error);
    throw error;
  }
};

export default pool;