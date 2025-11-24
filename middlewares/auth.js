import jwt from 'jsonwebtoken';
import { query } from '../db/config.js'; // Nécessaire pour vérifier le rôle en BDD

// 1. GÉNÉRATION DU TOKEN (Mise à jour avec le rôle)
export const generateToken = (userId, email, role) => {
  return jwt.sign(
    { userId, email, role }, // On ajoute le rôle dans le "Payload"
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
};

// 2. VÉRIFICATION DU TOKEN (Renommé pour coller aux routes)
export const verifyToken = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'Authentification requise (Token manquant)' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // On attache les infos à la requête pour la suite
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    req.userRole = decoded.role; // On récupère le rôle du token

    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token invalide ou expiré' });
  }
};

// 3. VÉRIFICATION ADMIN (Nouveau !)
// Ce middleware s'exécute APRÈS verifyToken
export const isAdmin = async (req, res, next) => {
  try {
    // Double sécurité : On vérifie en BDD que l'utilisateur est TOUJOURS admin
    // (Au cas où on lui aurait retiré ses droits entre temps)
    const result = await query('SELECT role FROM users WHERE id = $1', [req.userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Utilisateur introuvable" });
    }

    const userRole = result.rows[0].role;

    if (userRole !== 'admin') {
      // 403 = Forbidden (Interdit)
      return res.status(403).json({ message: "Accès refusé : Réservé aux Administrateurs." });
    }

    // C'est un admin, on laisse passer vers le contrôleur
    next(); 
  } catch (error) {
    console.error("Erreur middleware Admin:", error);
    res.status(500).json({ message: "Erreur serveur lors de la vérification des droits" });
  }
};