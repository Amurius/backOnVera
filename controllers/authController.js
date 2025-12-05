import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from '../db/config.js';
import { generateToken } from '../middlewares/auth.js';
import { sendInvitationEmail } from '../services/emailService.js';

// ==========================================
// 1. LOGIN (Sécurité Amina ✅)
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
// 2. GESTION INVITATIONS (Sécurité Amina ✅)
// ==========================================
export const inviteModo = async (req, res) => {
  try {
    const { email, firstName } = req.body;
    if (!email) return res.status(422).json({ message: "Email requis" });

    const check = await query('SELECT * FROM users WHERE email = $1', [email]);
    if (check.rows.length > 0) return res.status(409).json({ message: "Deja membre" });

    const invitationToken = crypto.randomBytes(32).toString('hex');

    await query(
      `INSERT INTO users (email, first_name, role, invitation_token)
       VALUES ($1, $2, 'modo', $3)`,
      [email, firstName, invitationToken]
    );

    // Envoyer l'email d'invitation
    try {
      await sendInvitationEmail(email, firstName, invitationToken);
      res.status(201).json({ message: "Invitation envoyee par email" });
    } catch (emailError) {
      // Si l'email echoue, on log quand meme le lien en console (fallback dev)
      console.warn('Email non envoye, fallback console:', emailError.message);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
      console.log(`LIEN INVITE : ${frontendUrl}/accept-invite?token=${invitationToken}`);
      res.status(201).json({
        message: "Invitation creee (email non envoye - voir console)",
        warning: "Configuration SMTP manquante"
      });
    }
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
// 3. GESTION PROFIL (Fusion Artus + Amina 🤝)
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


export const logout = async (req, res) => {
  try {
    res.json({
      message: 'Déconnexion réussie',
      success: true
    });
  } catch (error) {
    console.error('Erreur lors de la déconnexion:', error);
    res.status(500).json({ message: 'Erreur lors de la déconnexion' });
  }
};

export const updateUser = async (req, res) => {
  try {
    const { email, password, firstName, lastName, role } = req.body;
    const userId = req.userId;

    if (email) {
      const existingUser = await query(
        'SELECT * FROM users WHERE email = $1 AND id != $2',
        [email, userId]
      );

      if (existingUser.rows.length > 0) {
        return res.status(409).json({ message: 'Cet email est déjà utilisé' });
      }
    }

    let updateFields = [];
    let updateValues = [];
    let paramCounter = 1;

    if (email) {
      updateFields.push(`email = $${paramCounter}`);
      updateValues.push(email);
      paramCounter++;
    }

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateFields.push(`password = $${paramCounter}`);
      updateValues.push(hashedPassword);
      paramCounter++;
    }

    if (firstName !== undefined) {
      updateFields.push(`first_name = $${paramCounter}`);
      updateValues.push(firstName);
      paramCounter++;
    }

    if (lastName !== undefined) {
      updateFields.push(`last_name = $${paramCounter}`);
      updateValues.push(lastName);
      paramCounter++;
    }

    if (role) {
      updateFields.push(`role = $${paramCounter}`);
      updateValues.push(role);
      paramCounter++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ message: 'Aucune donnée à mettre à jour' });
    }

    updateValues.push(userId);

    const result = await query(
      `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramCounter} RETURNING id, email, first_name, last_name, role, created_at`,
      updateValues
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    const user = result.rows[0];
    res.json({
      message: 'Profil mis à jour avec succès',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du profil:', error);
    res.status(500).json({ message: 'Erreur lors de la mise à jour du profil' });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const userId = req.userId;

    const result = await query(
      'DELETE FROM users WHERE id = $1 RETURNING id',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    res.json({
      message: 'Compte supprimé avec succès',
      success: true
    });
  } catch (error) {
    console.error('Erreur lors de la suppression du compte:', error);
    res.status(500).json({ message: 'Erreur lors de la suppression du compte' });
  }
};
