import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from '../db/config.js';
import { generateToken } from '../middlewares/auth.js';

// ==========================================
// 1. SETUP ADMIN (Sécurité Amina ✅)
// ==========================================
export const register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, adminSecret } = req.body;

    if (adminSecret !== process.env.ADMIN_SECRET) {
      return res.status(403).json({ message: "Action non autorisée. Inscription publique fermée." });
    }

    if (!email || !password) {
      return res.status(422).json({ message: 'Email et mot de passe requis' });
    }

    const existingUser = await query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: 'Cet email est déjà utilisé' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await query(
      `INSERT INTO users (email, password, first_name, last_name, role) 
       VALUES ($1, $2, $3, $4, 'admin') 
       RETURNING id, email, first_name, last_name, role, created_at`,
      [email, hashedPassword, firstName || null, lastName || null]
    );

    const user = result.rows[0];
    const token = generateToken(user.id, user.email, user.role);

    res.status(201).json({ message: '👑 Admin créé', user, token });
  } catch (error) {
    console.error('Erreur inscription:', error);
    res.status(500).json({ message: "Erreur lors de l'inscription" });
  }
};

// ==========================================
// 2. LOGIN (Sécurité Amina ✅)
// ==========================================
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(422).json({ message: 'Email et mot de passe requis' });
    }

    const result = await query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }

    const user = result.rows[0];
    
    // Vérif compte activé (invitation acceptée ?)
    if (!user.password) {
      return res.status(403).json({ message: "Compte non activé. Vérifiez vos emails." });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }

    const token = generateToken(user.id, user.email, user.role);

    res.json({
      message: 'Connexion réussie',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role
      },
      token
    });

  } catch (error) {
    console.error("Erreur connexion:", error);
    res.status(500).json({ message: 'Erreur lors de la connexion' });
  }
};

// ==========================================
// 3. GESTION INVITATIONS (Sécurité Amina ✅)
// ==========================================
export const inviteModo = async (req, res) => {
  try {
    const { email, firstName } = req.body;
    if (!email) return res.status(422).json({ message: "Email requis" });

    const check = await query('SELECT * FROM users WHERE email = $1', [email]);
    if (check.rows.length > 0) return res.status(409).json({ message: "Déjà membre" });

    const invitationToken = crypto.randomBytes(32).toString('hex');

    await query(
      `INSERT INTO users (email, first_name, role, invitation_token) 
       VALUES ($1, $2, 'modo', $3)`,
      [email, firstName, invitationToken]
    );

    console.log(`📧 LIEN INVITE : http://localhost:4200/accept-invite?token=${invitationToken}`);
    res.status(201).json({ message: "Invitation envoyée (voir console)" });
  } catch (error) {
    console.error("Erreur invitation:", error);
    res.status(500).json({ message: "Erreur invitation" });
  }
};

export const acceptInvitation = async (req, res) => {
  try {
    const { token, password, lastName } = req.body;
    if (!token || !password) return res.status(422).json({ message: "Données manquantes" });

    const userResult = await query('SELECT * FROM users WHERE invitation_token = $1', [token]);
    if (userResult.rows.length === 0) return res.status(404).json({ message: "Lien invalide" });

    const user = userResult.rows[0];
    const hashedPassword = await bcrypt.hash(password, 10);

    await query(
      `UPDATE users SET password = $1, last_name = $2, invitation_token = NULL WHERE id = $3`,
      [hashedPassword, lastName || null, user.id]
    );

    res.status(200).json({ message: "Compte activé !" });
  } catch (error) {
    console.error("Erreur activation:", error);
    res.status(500).json({ message: "Erreur activation" });
  }
};

// ==========================================
// 4. GESTION PROFIL (Fusion Artus + Amina 🤝)
// ==========================================
export const getProfile = async (req, res) => {
  try {
    // On récupère tout ce qui est utile (fusion des deux codes)
    const result = await query(
      'SELECT id, email, first_name, last_name, role, created_at FROM users WHERE id = $1',
      [req.userId]
    );

    if (result.rows.length === 0) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erreur profil:', error);
    res.status(500).json({ message: 'Erreur profil' });
  }
};

// (Fonction d'Artus : Très utile !)
export const logout = async (req, res) => {
  try {
    res.json({ message: 'Déconnexion réussie', success: true });
  } catch (error) {
    res.status(500).json({ message: 'Erreur déconnexion' });
  }
};

// (Fonction d'Artus : Mise à jour du profil)
export const updateUser = async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body; // J'ai retiré 'role' pour la sécurité (un user ne peut pas se promouvoir admin)
    const userId = req.userId;

    if (email) {
      const existingUser = await query('SELECT * FROM users WHERE email = $1 AND id != $2', [email, userId]);
      if (existingUser.rows.length > 0) return res.status(409).json({ message: 'Email déjà pris' });
    }

    let updateFields = [];
    let updateValues = [];
    let paramCounter = 1;

    if (email) { updateFields.push(`email = $${paramCounter++}`); updateValues.push(email); }
    if (password) { 
      const hashedPassword = await bcrypt.hash(password, 10);
      updateFields.push(`password = $${paramCounter++}`); updateValues.push(hashedPassword);
    }
    if (firstName) { updateFields.push(`first_name = $${paramCounter++}`); updateValues.push(firstName); }
    if (lastName) { updateFields.push(`last_name = $${paramCounter++}`); updateValues.push(lastName); }

    if (updateFields.length === 0) return res.status(400).json({ message: 'Rien à modifier' });

    updateValues.push(userId);
    
    const result = await query(
      `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramCounter} RETURNING id, email, first_name, last_name, role`,
      updateValues
    );

    res.json({ message: 'Profil mis à jour', user: result.rows[0] });
  } catch (error) {
    console.error('Erreur update:', error);
    res.status(500).json({ message: 'Erreur mise à jour profil' });
  }
};

// (Fonction d'Artus : Supprimer son compte)
export const deleteUser = async (req, res) => {
  try {
    const result = await query('DELETE FROM users WHERE id = $1 RETURNING id', [req.userId]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Introuvable' });
    res.json({ message: 'Compte supprimé', success: true });
  } catch (error) {
    console.error('Erreur delete:', error);
    res.status(500).json({ message: 'Erreur suppression compte' });
  }
};