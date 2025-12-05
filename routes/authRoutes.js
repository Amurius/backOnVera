import express from 'express';
// 1. On importe TOUTES les fonctions (Amina + Artus)
import { 
  login, 
  getProfile, 
  inviteModo, 
  acceptInvitation, 
  logout,      // 🆕 Artus
  updateUser,  // 🆕 Artus
  deleteUser   // 🆕 Artus
} from '../controllers/authController.js';

// 2. On utilise tes middlewares sécurisés (Amina)
import { verifyToken, isAdmin } from '../middlewares/auth.js';

const router = express.Router();

// ==========================================
// 🔓 ROUTES PUBLIQUES
// ==========================================

// Connexion
router.post('/login', login);

// Activation compte Modo
router.post('/accept-invite', acceptInvitation);


// ==========================================
// 🔒 ROUTES PROTÉGÉES (Utilisateur connecté)
// ==========================================

// Voir son profil
router.get('/profile', verifyToken, getProfile);

// 🆕 Se déconnecter (Juste un message côté serveur)
router.post('/logout', verifyToken, logout);

// 🆕 Mettre à jour son profil (Nom, Email, Password)
router.put('/update', verifyToken, updateUser);

// 🆕 Supprimer son compte
router.delete('/delete', verifyToken, deleteUser);


// ==========================================
// 👑 ADMIN ONLY
// ==========================================

// Inviter un modérateur
router.post('/invite', verifyToken, isAdmin, inviteModo);

export default router;
