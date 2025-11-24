import express from 'express';
import { register, login, getProfile, logout, updateUser, deleteUser } from '../controllers/authController.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', authMiddleware, logout);
router.get('/profile', authMiddleware, getProfile);
router.put('/profile', authMiddleware, updateUser);
router.delete('/profile', authMiddleware, deleteUser);

export default router;
