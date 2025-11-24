import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from '../db/config.js';
import { generateToken } from '../middlewares/auth.js';

// ==========================================
// 1. SETUP ADMIN (Route Secrète)
// ==========================================
export const register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, adminSecret } = req.body;

    if (adminSecret !== process.env.ADMIN_SECRET) {
      return res.status(403).json({ message: "Action non autorisée." });
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
// 2. LOGIN 
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
// 3. INVITATION MODO
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

    // ⚠️ JE GARDE CE LOG : C'est le seul moyen pour toi de voir le lien pour l'instant !
    console.log(`📧 LIEN INVITE : http://localhost:4200/accept-invite?token=${invitationToken}`);
    
    res.status(201).json({ message: "Invitation envoyée (voir console)" });
  } catch (error) {
    console.error("Erreur invitation:", error);
    res.status(500).json({ message: "Erreur invitation" });
  }
};

// ==========================================
// 4. ACTIVATION COMPTE
// ==========================================
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
// 5. PROFIL
// ==========================================
export const getProfile = async (req, res) => {
  try {
    const result = await query('SELECT id, email, role FROM users WHERE id = $1', [req.userId]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erreur profil:', error);
    res.status(500).json({ message: 'Erreur profil' });
  }
};