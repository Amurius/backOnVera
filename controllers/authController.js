import bcrypt from 'bcryptjs';
import { query } from '../db/config.js';
import { generateToken } from '../middlewares/auth.js';

export const register = async (req, res) => {
  try {
    const { email, password, firstName, lastName} = req.body;
    const role = req.body.role ?? "default";

    console.log(email,role);
    if (!email || !password) {
      return res.status(400).json({ message: 'Email et mot de passe requis' });
    }

    const existingUser = await query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: 'Cet email est déjà utilisé' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await query(
      'INSERT INTO users (email, password, first_name, last_name, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, first_name, last_name, role, created_at',
      [email, hashedPassword, firstName || null, lastName || null, role]
    );

    const user = result.rows[0];
    const token = generateToken(user.id, user.email);

    res.status(201).json({
      message: 'Utilisateur créé avec succès',
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
    console.error('Erreur lors de l\'inscription:', error);
    res.status(500).json({ message: 'Erreur lors de l\'inscription' });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email et mot de passe requis' });
    }

    const result = await query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }

    const user = result.rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }

    const token = generateToken(user.id, user.email);

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
    console.error('Erreur lors de la connexion:', error);
    res.status(500).json({ message: 'Erreur lors de la connexion' });
  }
};

export const getProfile = async (req, res) => {
  try {
    const result = await query(
      'SELECT id, email, first_name, last_name, role, created_at FROM users WHERE id = $1',
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      createdAt: user.created_at
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du profil:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération du profil' });
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
