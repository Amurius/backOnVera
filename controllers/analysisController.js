import OpenAI from 'openai';
import { query } from '../db/config.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ==========================================
// 1. ANALYSE IMAGE (OCR)
// ==========================================
export const analyzeImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(422).json({ message: 'Aucune image fournie' });
    }

    const userId = req.userId;
    // CORRECTION BUG : On définit bien base64Image
    const base64Image = req.file.buffer.toString("base64");
    
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Extrais toutes les informations et affirmations factuelles presentes. Retourne uniquement ces informations sous forme de liste ou de texte, sans introduction ni commentaire. Ne mentionne jamais qu'il s'agit d'une image."
            },
            {
              type: "input_image",
              image_url: `data:${req.file.mimetype};base64,${base64Image}`
            }
          ]
        }
      ]
    });

    const extractedText = response.output_text;

    await query(
      'INSERT INTO ocr_analyses (user_id, extracted_text) VALUES ($1, $2)',
      [userId, extractedText]
    );

    res.json({
      message: 'Analyse OCR terminée',
      extractedText
    });
  } catch (error) {
    console.error('Erreur lors de l\'analyse OCR:', error);
    res.status(500).json({ message: 'Erreur lors de l\'analyse OCR' });
  }
};

// ==========================================
// 2. ANALYSE VIDÉO
// ==========================================
export const analyzeVideo = async (req, res) => {
  try {
    // On vérifie que le middleware a bien fait son travail
    if (!req.frames || !req.audio) {
      return res.status(422).json({ message: 'Erreur traitement vidéo (Frames manquantes)' });
    }

    const userId = req.userId;
    const framesBase64 = req.frames;

    // On convertit les frames en chaînes base64 utilisables
    const imagesBase64 = framesBase64.map((frame) => frame.toString("base64"));

    // Transcription audio avec Whisper
    const audioBuffer = Buffer.from(req.audio, 'base64');
    const audioFile = new File([audioBuffer], 'audio.wav', { type: 'audio/wav' });

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'fr'
    });

    const audioTranscription = transcription.text

    const videoAnalysis = await openai.responses.create({
      model: "gpt-5-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Extrais toutes les informations et affirmations factuelles presentes. Decris les actions, les objets, les personnes et le contexte. Retourne uniquement ces informations sans introduction ni commentaire. Ne mentionne jamais qu'il s'agit d'une video, d'images ou de frames."
            },
            ...imagesBase64.map((img64) => ({
              type: "input_image",
              image_url: `data:image/jpeg;base64,${img64}`
            }))
          ]
        }
      ]
    });

    const videoDescription = videoAnalysis.output_text;

    await query(
      'INSERT INTO video_analyses (user_id, audio_transcription, video_analysis) VALUES ($1, $2, $3)',
      [userId, audioTranscription, videoDescription]
    );

    res.json({
      message: 'Analyse vidéo terminée',
      audioTranscription,
      videoAnalysis: videoDescription
    });

  } catch (error) {
    console.error('Erreur lors de l\'analyse vidéo:', error);
    res.status(500).json({ message: 'Erreur lors de l\'analyse vidéo' });
  }
};

// ==========================================
// 3. ANALYSE TEXTE (API VERA)
// ==========================================
export const analyzeText = async (req, res) => {
  try {
    const { text } = req.body;
    const userId = req.userId ?? "anonyme";

    if (!text) {
      return res.status(422).json({ message: 'Texte requis' });
    }

    const veraResponse = await fetch('https://feat-api-partner---api-ksrn3vjgma-od.a.run.app/api/v1/chat', {
      method: 'POST',
      headers: {
        'X-API-Key': process.env.VERA_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: userId, // On passe l'ID utilisateur
        query: text
      })
    });

    if (!veraResponse.ok) {
      throw new Error(`Erreur API Vera: ${veraResponse.status}`);
    }

    const veraAnalysis = await veraResponse.text();

    res.json({
      message: 'Analyse de texte terminée',
      veraAnalysis
    });
  } catch (error) {
    console.error('Erreur lors de l\'analyse de texte:', error);
    res.status(500).json({ message: 'Erreur lors de l\'analyse de texte' });
  }
};

// ==========================================
// 4. HISTORIQUES
// ==========================================
export const getOcrAnalyses = async (req, res) => {
  try {
    const userId = req.userId;
    const result = await query(
      'SELECT * FROM ocr_analyses WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    res.json({ analyses: result.rows });
  } catch (error) {
    console.error('Erreur hist OCR:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des analyses' });
  }
};

export const getVideoAnalyses = async (req, res) => {
  try {
    const userId = req.userId;
    const result = await query(
      'SELECT * FROM video_analyses WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    res.json({ analyses: result.rows });
  } catch (error) {
    console.error('Erreur hist Vidéo:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des analyses' });
  }
};
