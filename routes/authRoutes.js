import express from 'express';
import { 
  register, 
  login, 
  getProfile, 
  inviteModo, 
  acceptInvitation 
} from '../controllers/authController.js';

// Import des middlewares de sécurité
import { verifyToken, isAdmin } from '../middlewares/auth.js';

const router = express.Router();

// ==========================================
// 🔓 ROUTES PUBLIQUES
// ==========================================

// 1. Setup Admin (Protégé par le code secret du .env uniquement)
router.post('/register', register); 

// 2. Connexion (Pour Admin et Modos actifs)
router.post('/login', login);

// 3. Activation du compte (Le lien cliqué par le Modo dans son mail)
router.post('/accept-invite', acceptInvitation);


// ==========================================
// 🔒 ROUTES PROTÉGÉES (Token requis)
// ==========================================

// Profil de l'utilisateur connecté
router.get('/profile', verifyToken, getProfile);


// ==========================================
// 👑 ADMIN ONLY (Token + Rôle Admin requis)
// ==========================================

// Inviter un nouveau modérateur
router.post('/invite', verifyToken, isAdmin, inviteModo);

export default router;