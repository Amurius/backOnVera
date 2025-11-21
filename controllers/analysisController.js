import OpenAI from 'openai';
import { query } from '../db/config.js';
import fs from 'fs';
import path from 'path';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export const analyzeImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Aucune image fournie' });
    }

    const userId = req.userId;
    const base64Image = req.file.buffer.toString("base64");
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyse cette image et le retourner de manière structurée la description. Effectue une analyse OCR complète."
            },
          {
          type: "image_url",
          image_url: {
            url: `data:${req.file.mimetype};base64,${img64}`
          }
            }
            }
          ]
        }
      ],
      max_tokens: 5000
    });

    const extractedText = response.choices[0].message.content;

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
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ message: 'Erreur lors de l\'analyse OCR' });
  }
};

export const analyzeVideo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Aucune vidéo fournie' });
    }

    const userId = req.userId;
    const framesBase64 = req.frames; // tableau de base64
    const audioBase64 = req.audio;   // audio base64    
    const imagesBase64 = framesBase64.map((frame) =>
      frame.toString("base64")
    );

    //const audioTranscription = await openai.audio.transcriptions.create({
    //  file: fs.createReadStream(audioPath),
    //  model: "whisper-1",
    //  language: "fr"
    //});

    const videoAnalysis = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyse cette vidéo frame par frame et décris ce que tu vois : les actions, les objets, les personnes, le contexte général. Fournis une description détaillée."
            },
            ...imagesBase64.map((img64) => ({
          type: "image_url",
          image_url: {
            url: `data:image/jpeg;base64,${img64}`
          }
        }))
          ]
        }
      ],
      max_tokens: 50000
    });

    const videoDescription = videoAnalysis.choices[0].message.content;

    //await query(
   //   'INSERT INTO video_analyses (user_id, video_url, audio_transcription, video_analysis) VALUES ($1, $2, $3, $4)',
   //   [userId, req.file.filename, audioTranscription.text, videoDescription]
   // );

    res.json({
      message: 'Analyse vidéo terminée',
      audioTranscription: audioTranscription.text,
      videoAnalysis: videoDescription
    });
  } catch (error) {
    console.error('Erreur lors de l\'analyse vidéo:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ message: 'Erreur lors de l\'analyse vidéo' });
  }
};

export const getOcrAnalyses = async (req, res) => {
  try {
    const userId = req.userId;

    const result = await query(
      'SELECT * FROM ocr_analyses WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    res.json({ analyses: result.rows });
  } catch (error) {
    console.error('Erreur lors de la récupération des analyses OCR:', error);
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
    console.error('Erreur lors de la récupération des analyses vidéo:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des analyses' });
  }
};

export const analyzeText = async (req, res) => {
  try {
    const { text } = req.body;
    const userId = req.userId;

    if (!text) {
      return res.status(400).json({ message: 'Texte requis' });
    }

    const veraResponse = await fetch('https://www.askvera.org/api/v1/chat', {
      method: 'POST',
      headers: {
        'X-API-Key': process.env.VERA_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: userId,
        query: text
      })
    });

    if (!veraResponse.ok) {
      throw new Error(`Erreur API Vera: ${veraResponse.status}`);
    }

    const veraAnalysis = await veraResponse.json();

    res.json({
      message: 'Analyse de texte terminée',
      query: text,
      veraAnalysis
    });
  } catch (error) {
    console.error('Erreur lors de l\'analyse de texte:', error);
    res.status(500).json({ message: 'Erreur lors de l\'analyse de texte' });
  }
};
