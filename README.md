# Backend API Sondage Vera

API REST construite avec Node.js, Express et PostgreSQL pour la gestion de sondages avec authentification JWT et fonctionnalités d'analyse par IA.

## Fonctionnalités

- Authentification avec JWT (inscription, connexion)
- Gestion de sondages (consultation, réponses)
- Dashboard protégé pour les utilisateurs connectés
- Analyse OCR d'images avec ChatGPT (OpenAI)
- Analyse de vidéos avec Whisper (transcription audio) et GPT-4 Vision (analyse vidéo)
- Analyse de texte avec l'API Vera

## Prérequis

- Node.js (v18 ou supérieur) ou Bun
- PostgreSQL (v14 ou supérieur)
- FFmpeg (pour le traitement vidéo)
- Compte OpenAI avec clé API

## Installation

1. Cloner le projet et installer les dépendances :

```bash
cd back
bun install
```

2. Configurer les variables d'environnement :

```bash
cp .env.example .env
```

Modifier le fichier `.env` avec vos valeurs :
- `DB_*` : Configuration PostgreSQL
- `JWT_SECRET` : Clé secrète pour les tokens JWT
- `OPENAI_API_KEY` : Votre clé API OpenAI
- `VERA_API_KEY` : Votre clé API Vera

3. Créer la base de données et les tables :

```bash
psql -U postgres
CREATE DATABASE sondage_db;
\c sondage_db
\i db/schema.sql
```

## Démarrage

### Mode développement :
```bash
bun run dev
```

### Mode production :
```bash
bun start
```

Le serveur démarre sur `http://localhost:3000`

## API Endpoints

### Authentification (`/api/auth`)

- `POST /api/auth/register` - Créer un compte
  - Body: `{ email, password, firstName, lastName }`
- `POST /api/auth/login` - Se connecter
  - Body: `{ email, password }`
- `GET /api/auth/profile` - Obtenir son profil (protégé)

### Sondages (`/api/surveys`)

- `GET /api/surveys` - Liste des sondages actifs
- `GET /api/surveys/:id` - Détails d'un sondage
- `POST /api/surveys/response` - Soumettre une réponse (protégé)
  - Body: `{ surveyId, responses: [{ questionId, answer }] }`
- `GET /api/surveys/:id/results` - Résultats d'un sondage (protégé)

### Dashboard (`/api/dashboard`) - Toutes les routes protégées

- `GET /api/dashboard/stats` - Statistiques personnelles
- `GET /api/dashboard/my-surveys` - Mes sondages créés
- `GET /api/dashboard/my-responses` - Mes réponses aux sondages

### Analyses IA (`/api/analysis`) - Toutes les routes protégées

- `POST /api/analysis/ocr` - Analyser une image (OCR avec OpenAI)
  - Body: Form-data avec `image` (fichier)
  - Retourne: texte extrait
- `POST /api/analysis/video` - Analyser une vidéo (Whisper + GPT-4 Vision)
  - Body: Form-data avec `video` (fichier)
  - Retourne: transcription audio + analyse visuelle
- `POST /api/analysis/text` - Analyser du texte avec Vera AI
  - Body: `{ text: "votre texte à analyser" }`
  - Retourne: analyse Vera
- `GET /api/analysis/ocr` - Historique des analyses OCR
- `GET /api/analysis/video` - Historique des analyses vidéo

## Format des tokens

Pour les routes protégées, inclure le header :
```
Authorization: Bearer <votre_token_jwt>
```

## Structure du projet

```
back/
├── controllers/        # Logique métier
├── db/                # Configuration et schéma BDD
├── middlewares/       # Middleware d'authentification
├── routes/           # Définition des routes
├── uploads/          # Fichiers uploadés (créé automatiquement)
└── server.js         # Point d'entrée
```

## Technologies utilisées

- Express 5
- PostgreSQL (pg)
- JWT (jsonwebtoken)
- bcryptjs
- OpenAI API (gpt-4o, whisper-1)
- Multer (upload de fichiers)
- FFmpeg (traitement vidéo)

## Notes importantes

- Les fichiers uploadés sont automatiquement supprimés après traitement
- La limite de taille pour les uploads est de 50 MB
- L'analyse vidéo peut prendre du temps selon la taille du fichier
- Le modèle GPT-4o est utilisé pour l'OCR et l'analyse vidéo
- L'API Vera est utilisée pour l'analyse de texte via l'endpoint `/api/analysis/text`
- Les endpoints OCR et vidéo retournent du texte brut qui peut ensuite être envoyé à l'endpoint text pour analyse
