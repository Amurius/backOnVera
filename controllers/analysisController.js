
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import { query } from '../db/config.js';
import fs from 'fs';
import path from 'path';
import os from 'os';


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

// Limite de caractères pour l'API Vera (environ 50KB pour éviter l'erreur 413)
const MAX_VERA_CONTENT_LENGTH = 50000;
const VERA_API_URL = 'https://feat-api-partner---api-ksrn3vjgma-od.a.run.app/api/v1/chat';

/**
 * Découpe le texte en morceaux de taille maximale pour l'API Vera
 */
const splitTextIntoChunks = (text, maxLength = MAX_VERA_CONTENT_LENGTH) => {
  if (!text || text.length <= maxLength) {
    return [text];
  }

  const chunks = [];
  let remainingText = text;

  while (remainingText.length > 0) {
    if (remainingText.length <= maxLength) {
      chunks.push(remainingText);
      break;
    }

    let chunk = remainingText.substring(0, maxLength);
    const lastSentenceEnd = Math.max(
      chunk.lastIndexOf('. '),
      chunk.lastIndexOf('.\n'),
      chunk.lastIndexOf('! '),
      chunk.lastIndexOf('!\n'),
      chunk.lastIndexOf('? '),
      chunk.lastIndexOf('?\n'),
      chunk.lastIndexOf('\n\n')
    );

    if (lastSentenceEnd > maxLength * 0.8) {
      chunk = remainingText.substring(0, lastSentenceEnd + 1);
    }

    chunks.push(chunk.trim());
    remainingText = remainingText.substring(chunk.length).trim();
  }

  return chunks;
};

/**
 * Envoie le contenu à Vera en plusieurs requêtes si nécessaire
 * et combine les réponses
 */
const sendToVeraWithChunking = async (content, userQuestion, analysisLabel, userId) => {
  const chunks = splitTextIntoChunks(content);
  const totalChunks = chunks.length;
  let fullAnalysis = '';

  for (let i = 0; i < totalChunks; i++) {
    const chunk = chunks[i];
    const isFirstChunk = i === 0;
    const isLastChunk = i === totalChunks - 1;

    let veraQuery = '';
    if (isFirstChunk) {
      if (userQuestion && userQuestion.trim()) {
        veraQuery = `Question utilisateur : "${userQuestion.trim()}"\n\n${analysisLabel} :\n${chunk}`;
      } else {
        veraQuery = `Peux-tu verifier les informations suivantes :\n\n${chunk}`;
      }
      if (totalChunks > 1) {
        veraQuery += `\n\n[Suite du contenu à venir - Partie 1/${totalChunks}]`;
      }
    } else {
      veraQuery = `Suite du contenu (Partie ${i + 1}/${totalChunks}) :\n\n${chunk}`;
      if (!isLastChunk) {
        veraQuery += `\n\n[Suite à venir]`;
      } else {
        veraQuery += `\n\n[Fin du contenu - Merci de fournir une analyse complète]`;
      }
    }

    const veraResponse = await fetch(VERA_API_URL, {
      method: 'POST',
      headers: {
        'X-API-Key': process.env.VERA_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: userId,
        query: veraQuery
      })
    });

    if (!veraResponse.ok) {
      throw new Error(`Erreur API Vera: ${veraResponse.status}`);
    }

    const chunkAnalysis = await veraResponse.text();
    if (totalChunks > 1) {
      fullAnalysis += `\n\n--- Partie ${i + 1}/${totalChunks} ---\n\n${chunkAnalysis}`;
    } else {
      fullAnalysis = chunkAnalysis;
    }
  }

  return fullAnalysis;
};

// Recupere l'ID de l'utilisateur anonyme depuis la BDD
const getAnonymousUserId = async () => {
  const result = await query(
    'SELECT id FROM users WHERE email = $1',
    ['anonyme@anonyme.com']
  );
  if (result.rows.length === 0) {
    throw new Error('Utilisateur anonyme non trouve');
  }
  return result.rows[0].id;
};

// ==========================================
// 1. ANALYSE IMAGE (OCR)
// ==========================================
export const analyzeImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(422).json({ message: 'Aucune image fournie' });
    }

    const userId = req.userId ?? await getAnonymousUserId();
    const userQuestion = req.body?.userQuestion || '';
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

    // Envoi à Vera avec gestion automatique du chunking si le texte est trop long
    const veraAnalysis = await sendToVeraWithChunking(
      extractedText,
      userQuestion,
      'Analyse image',
      userId
    );

    res.json({
      message: 'Analyse OCR terminee',
      extractedText,
      veraAnalysis
    });
  } catch (error) {
    console.error('Erreur lors de l\'analyse OCR:', error);
    res.status(500).json({ message: 'Erreur lors de l\'analyse OCR' });
  }
};

// ==========================================
// 2. ANALYSE VIDEO (Gemini File Upload + Vera)
// ==========================================
export const analyzeVideo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(422).json({ message: 'Aucune video fournie' });
    }

    const userId = req.userId ?? await getAnonymousUserId();
    const userQuestion = req.body?.userQuestion || '';
    const mimeType = req.file.mimetype;

    // Sauvegarder temporairement le fichier pour l'upload
    const tempFilePath = path.join(os.tmpdir(), `video-${Date.now()}.mp4`);
    fs.writeFileSync(tempFilePath, req.file.buffer);

    // Upload du fichier vers Gemini
    const uploadResult = await fileManager.uploadFile(tempFilePath, {
      mimeType: mimeType,
      displayName: req.file.originalname || 'video.mp4'
    });

    // Supprimer le fichier temporaire
    fs.unlinkSync(tempFilePath);

    // Attendre que le fichier soit traite (statut ACTIVE)
    let file = uploadResult.file;
    while (file.state === 'PROCESSING') {
      await new Promise(resolve => setTimeout(resolve, 2000));
      file = await fileManager.getFile(file.name);
    }

    if (file.state === 'FAILED') {
      throw new Error('Le traitement du fichier a echoue');
    }

    // Analyse de la video avec Gemini
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const geminiResult = await model.generateContent([
      {
        fileData: {
          mimeType: file.mimeType,
          fileUri: file.uri
        }
      },
      {
        text: `Analyse cette video en detail et extrais uniquement les informations factuelles suivantes:
- Le theme principal et le sujet traite
- Les faits, chiffres, statistiques ou donnees mentionnes
- Les affirmations ou declarations importantes
- Les personnes, lieux, evenements ou organisations cites
- Le contexte et les elements visuels significatifs

Retourne uniquement ces informations de maniere structuree, sans introduction, sans commentaire personnel et sans mentionner qu'il s'agit d'une video. Reponds en francais.`
      }
    ]);

    const videoContent = geminiResult.response.text();

    // Supprimer le fichier de Gemini apres analyse
    await fileManager.deleteFile(file.name);

    // Envoi à Vera avec gestion automatique du chunking si le texte est trop long
    const veraAnalysis = await sendToVeraWithChunking(
      videoContent,
      userQuestion,
      'Analyse vidéo',
      userId
    );

    await query(
      'INSERT INTO video_analyses (user_id, video_analysis) VALUES ($1, $2)',
      [userId, videoContent]
    );

    res.json({
      message: 'Analyse video terminee',
      veraAnalysis
    });

  } catch (error) {
    console.error('Erreur lors de l\'analyse video:', error);
    res.status(500).json({ message: 'Erreur lors de l\'analyse video' });
  }
};

// ==========================================
// 3. ANALYSE TEXTE (API VERA)
// ==========================================
export const analyzeText = async (req, res) => {
  try {
    const { text } = req.body;
    const userId = req.userId ?? await getAnonymousUserId();

    if (!text) {
      return res.status(422).json({ message: 'Texte requis' });
    }

    // Utiliser le chunking pour gérer les textes longs
    const chunks = splitTextIntoChunks(text);
    const totalChunks = chunks.length;
    let fullVeraAnalysis = '';

    for (let i = 0; i < totalChunks; i++) {
      const chunk = chunks[i];
      const isFirstChunk = i === 0;
      const isLastChunk = i === totalChunks - 1;

      let veraQuery = chunk;
      if (totalChunks > 1) {
        if (isFirstChunk) {
          veraQuery = `${chunk}\n\n[Suite du contenu à venir - Partie 1/${totalChunks}]`;
        } else if (!isLastChunk) {
          veraQuery = `Suite du contenu (Partie ${i + 1}/${totalChunks}) :\n\n${chunk}\n\n[Suite à venir]`;
        } else {
          veraQuery = `Suite du contenu (Partie ${i + 1}/${totalChunks}) :\n\n${chunk}\n\n[Fin du contenu]`;
        }
      }

      const veraResponse = await fetch(VERA_API_URL, {
        method: 'POST',
        headers: {
          'X-API-Key': process.env.VERA_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: userId,
          query: veraQuery
        })
      });

      if (!veraResponse.ok) {
        throw new Error(`Erreur API Vera: ${veraResponse.status}`);
      }

      const chunkAnalysis = await veraResponse.text();
      if (totalChunks > 1) {
        fullVeraAnalysis += `\n\n--- Partie ${i + 1}/${totalChunks} ---\n\n${chunkAnalysis}`;
      } else {
        fullVeraAnalysis = chunkAnalysis;
      }
    }

    res.json({
      message: 'Analyse de texte terminee',
      veraAnalysis: fullVeraAnalysis.trim()
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
    res.status(500).json({ message: 'Erreur lors de la recuperation des analyses' });
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
    console.error('Erreur hist Video:', error);
    res.status(500).json({ message: 'Erreur lors de la recuperation des analyses' });
  }
};
