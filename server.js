import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import authRoutes from './routes/authRoutes.js';
import surveyRoutes from './routes/surveyRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import analysisRoutes from './routes/analysisRoutes.js';
import factCheckRoutes from './routes/factCheckRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.json({ message: 'API Sondage - Serveur opérationnel' });
});

app.use('/api/auth', authRoutes);
app.use('/api/surveys', surveyRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/fact-check', factCheckRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Une erreur est survenue sur le serveur' });
});

app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
