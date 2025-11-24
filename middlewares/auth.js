import jwt from 'jsonwebtoken';
import { query } from '../db/config.js'; // Nécessaire pour vérifier le rôle en BDD

// ==========================================
// 1. GÉNÉRATION DU TOKEN
// ==========================================
export const generateToken = (userId, email, role) => {
  return jwt.sign(
    { userId, email, role }, // On inclut le rôle pour que le Front sache qui est connecté
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
};

// ==========================================
// 2. VÉRIFICATION DU TOKEN (Standard)
// ==========================================
export const verifyToken = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'Authentification requise (Token manquant)' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // On injecte les infos dans la requête pour les contrôleurs suivants
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    req.userRole = decoded.role; 

    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token invalide ou expiré' });
  }
};

// ==========================================
// 3. VÉRIFICATION ADMIN (Sécurité Max)
// ==========================================
export const isAdmin = async (req, res, next) => {
  try {
    // On vérifie en base de données que l'utilisateur est bien Admin
    // (C'est plus sûr que de faire confiance au token seul)
    const result = await query('SELECT role FROM users WHERE id = $1', [req.userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Utilisateur introuvable" });
    }

    const userRole = result.rows[0].role;

    if (userRole !== 'admin') {
      return res.status(403).json({ message: "Accès refusé : Réservé aux Administrateurs." });
    }

    next(); 
  } catch (error) {
    console.error("Erreur middleware Admin:", error);
    res.status(500).json({ message: "Erreur serveur lors de la vérification des droits" });
  }
};