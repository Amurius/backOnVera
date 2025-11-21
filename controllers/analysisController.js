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
    const imagePath = req.file.path;

    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extraire tout le texte visible dans cette image et le retourner de manière structurée. Effectue une analyse OCR complète."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${req.file.mimetype};base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 2000
    });

    const extractedText = response.choices[0].message.content;

    await query(
      'INSERT INTO ocr_analyses (user_id, image_url, extracted_text) VALUES ($1, $2, $3)',
      [userId, req.file.filename, extractedText]
    );

    fs.unlinkSync(imagePath);

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
    const videoPath = req.file.path;
    const audioPath = path.join(path.dirname(videoPath), `audio-${Date.now()}.mp3`);

    const ffmpeg = (await import('fluent-ffmpeg')).default;

    await new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .output(audioPath)
        .audioCodec('libmp3lame')
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    const audioTranscription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: "whisper-1",
      language: "fr"
    });

    const videoBuffer = fs.readFileSync(videoPath);
    const base64Video = videoBuffer.toString('base64');

    const videoAnalysis = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyse cette vidéo et décris ce que tu vois : les actions, les objets, les personnes, le contexte général. Fournis une description détaillée."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${req.file.mimetype};base64,${base64Video}`
              }
            }
          ]
        }
      ],
      max_tokens: 2000
    });

    const videoDescription = videoAnalysis.choices[0].message.content;

    await query(
      'INSERT INTO video_analyses (user_id, video_url, audio_transcription, video_analysis) VALUES ($1, $2, $3, $4)',
      [userId, req.file.filename, audioTranscription.text, videoDescription]
    );

    fs.unlinkSync(videoPath);
    fs.unlinkSync(audioPath);

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
