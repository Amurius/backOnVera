import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import { fetchTranscript } from 'youtube-transcript-plus';
import { query } from '../db/config.js';
import { processQuestion } from '../services/clusteringService.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

const VERA_API_URL = 'https://feat-api-partner---api-ksrn3vjgma-od.a.run.app/api/v1/chat';

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

// Genere ou recupere l'ID de session anonyme pour Vera
const getSessionId = (req) => {
  // Recupere depuis le header ou le body
  const sessionId = req.headers['x-session-id'] || req.body?.sessionId;
  if (sessionId) {
    return sessionId;
  }
  // Genere un nouvel ID de session
  return crypto.randomUUID();
};

// Extrait l'ID YouTube d'une URL
const extractYouTubeId = (url) => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
};

// Verifie si c'est un lien YouTube valide
const isYouTubeUrl = (url) => {
  return extractYouTubeId(url) !== null;
};

// Fallback: Recupere les sous-titres avec yt-dlp si youtube-transcript-plus echoue
const fetchTranscriptWithYtDlp = (videoId) => {
  const tempDir = os.tmpdir();
  const outputPath = path.join(tempDir, `yt-${videoId}`);

  try {
    // Telecharger les sous-titres avec yt-dlp (auto-generated ou manuels)
    execSync(
      `yt-dlp --skip-download --write-auto-sub --write-sub --sub-lang fr,en --sub-format vtt -o "${outputPath}" "https://www.youtube.com/watch?v=${videoId}"`,
      { stdio: 'pipe', timeout: 60000 }
    );

    // Chercher le fichier de sous-titres genere
    const files = fs.readdirSync(tempDir);
    const subtitleFile = files.find(f => f.startsWith(`yt-${videoId}`) && (f.endsWith('.vtt') || f.endsWith('.srt')));

    if (!subtitleFile) {
      throw new Error('Aucun fichier de sous-titres trouve');
    }

    const subtitlePath = path.join(tempDir, subtitleFile);
    const content = fs.readFileSync(subtitlePath, 'utf-8');

    // Nettoyer le fichier temporaire
    fs.unlinkSync(subtitlePath);

    // Parser le VTT/SRT pour extraire le texte
    const lines = content.split('\n');
    const textLines = lines.filter(line => {
      // Ignorer les timestamps, numeros de sequence et lignes vides
      return line.trim() &&
             !line.match(/^\d+$/) &&
             !line.match(/^WEBVTT/) &&
             !line.match(/^\d{2}:\d{2}/) &&
             !line.match(/-->/);
    });

    // Supprimer les tags HTML et balises VTT
    const cleanText = textLines
      .map(line => line.replace(/<[^>]+>/g, '').trim())
      .filter(line => line.length > 0)
      .join(' ');

    return cleanText;
  } catch (error) {
    // Nettoyer les fichiers temporaires en cas d'erreur
    try {
      const files = fs.readdirSync(tempDir);
      files.filter(f => f.startsWith(`yt-${videoId}`)).forEach(f => {
        fs.unlinkSync(path.join(tempDir, f));
      });
    } catch (e) {}

    throw error;
  }
};

// Fonction pour envoyer des chunks SSE
const sendSSE = (res, data) => {
  if (typeof data === 'string') {
    res.write(`data: ${JSON.stringify({ content: data })}\n\n`);
  } else {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }
};

// Fonction pour streamer la reponse Vera caractere par caractere (fallback)
const streamVeraResponse = async (res, veraText, chunkSize = 5, delay = 20) => {
  for (let i = 0; i < veraText.length; i += chunkSize) {
    const chunk = veraText.slice(i, i + chunkSize);
    sendSSE(res, chunk);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
};

// Fonction pour streamer la reponse Vera en temps reel (si API supporte streaming)
const streamVeraResponseRealtime = async (res, veraResponse) => {
  const reader = veraResponse.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      if (chunk) {
        sendSSE(res, chunk);
      }
    }
    return true;
  } catch (error) {
    console.error('Erreur streaming Vera:', error);
    return false;
  }
};

// ==========================================
// 1. STREAM CHAT (Texte)
// ==========================================
export const streamChat = async (req, res) => {
  // Recuperer le sessionId avant de configurer SSE
  const sessionId = getSessionId(req);

  // Configuration SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('X-Session-Id', sessionId);
  res.flushHeaders();

  try {
    const { content } = req.body;
    const dbUserId = await getAnonymousUserId();

    if (!content) {
      sendSSE(res, { error: 'Contenu requis' });
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    // Sauvegarder le message utilisateur (avec l'ID anonyme de la BDD)
    await query(
      'INSERT INTO chat_messages (user_id, role, content, content_type) VALUES ($1, $2, $3, $4)',
      [dbUserId, 'user', content, 'text']
    );

    // Appel API Vera (avec le sessionId)
    const veraResponse = await fetch(VERA_API_URL, {
      method: 'POST',
      headers: {
        'X-API-Key': process.env.VERA_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: sessionId,
        query: content
      })
    });

    if (!veraResponse.ok) {
      throw new Error(`Erreur API Vera: ${veraResponse.status}`);
    }

    // Essaie le streaming temps reel, sinon fallback sur simulation
    let veraAnalysis = '';
    const contentType = veraResponse.headers.get('content-type') || '';

    console.log('=== VERA RESPONSE DEBUG ===');
    console.log('Content-Type:', contentType);
    console.log('Headers:', Object.fromEntries(veraResponse.headers.entries()));

    if (contentType.includes('text/event-stream') || contentType.includes('stream')) {
      // API Vera supporte le streaming
      console.log('MODE: Streaming temps reel');
      const reader = veraResponse.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          veraAnalysis += chunk;
          sendSSE(res, chunk);
        }
      }
    } else {
      // Fallback: lire tout puis simuler le streaming
      console.log('MODE: POST classique (simulation streaming)');
      veraAnalysis = await veraResponse.text();
      console.log('Reponse Vera recue, longueur:', veraAnalysis.length, 'caracteres');
      console.log('Debut de la reponse:', veraAnalysis.substring(0, 100) + '...');
      await streamVeraResponse(res, veraAnalysis);
    }
    console.log('=== FIN VERA DEBUG ===')

    // Sauvegarder la reponse assistant (avec l'ID anonyme de la BDD)
    await query(
      'INSERT INTO chat_messages (user_id, role, content, content_type) VALUES ($1, $2, $3, $4)',
      [dbUserId, 'assistant', veraAnalysis, 'text']
    );

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('Erreur chat stream:', error);
    sendSSE(res, { error: error.message || 'Une erreur est survenue' });
    res.write('data: [DONE]\n\n');
    res.end();
  }
};

// ==========================================
// 2. STREAM CHAT AVEC FICHIER (Image/Video)
// ==========================================
export const streamChatFile = async (req, res) => {
  // Recuperer le sessionId avant de configurer SSE
  const sessionId = getSessionId(req);

  // Configuration SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('X-Session-Id', sessionId);
  res.flushHeaders();

  let tempFilePath = null;
  let geminiFileName = null;

  try {
    if (!req.file) {
      sendSSE(res, { error: 'Aucun fichier fourni' });
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    const dbUserId = await getAnonymousUserId();
    const fileType = req.body.type || 'file';
    const mimeType = req.file.mimetype;
    const isVideo = mimeType.startsWith('video/');
    const isImage = mimeType.startsWith('image/');

    let extractedContent = '';

    // Sauvegarder le message utilisateur (avec l'ID anonyme de la BDD)
    await query(
      'INSERT INTO chat_messages (user_id, role, content, content_type, file_name) VALUES ($1, $2, $3, $4, $5)',
      [dbUserId, 'user', isVideo ? 'Video envoyee' : 'Fichier envoye', fileType, req.file.originalname]
    );

    sendSSE(res, 'Analyse du fichier en cours...\n\n');

    if (isImage) {
      // Analyse OCR avec OpenAI
      const base64Image = req.file.buffer.toString('base64');

      // Extraire le theme de l'image pour le clustering
      const themeResponse = await openai.responses.create({
        model: 'gpt-4.1-mini',
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: 'Quel est le theme principal de cette image ? Reponds en une seule phrase courte et concise (maximum 100 caracteres).'
              },
              {
                type: 'input_image',
                image_url: `data:${mimeType};base64,${base64Image}`
              }
            ]
          }
        ]
      });

      const imageTheme = themeResponse.output_text;

      // Envoyer le theme au clustering
      try {
        await processQuestion(imageTheme);
        console.log(`Theme image envoye au clustering: ${imageTheme}`);
      } catch (clusterError) {
        console.error('Erreur clustering theme image:', clusterError);
      }

      const response = await openai.responses.create({
        model: 'gpt-4.1-mini',
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: 'Extrais toutes les informations et affirmations factuelles presentes. Retourne uniquement ces informations sous forme de liste ou de texte, sans introduction ni commentaire. Ne mentionne jamais qu\'il s\'agit d\'une image.'
              },
              {
                type: 'input_image',
                image_url: `data:${mimeType};base64,${base64Image}`
              }
            ]
          }
        ]
      });

      extractedContent = response.output_text;

    } else if (isVideo) {
      // Analyse video avec Gemini
      tempFilePath = path.join(os.tmpdir(), `video-${Date.now()}.mp4`);
      fs.writeFileSync(tempFilePath, req.file.buffer);

      const uploadResult = await fileManager.uploadFile(tempFilePath, {
        mimeType: mimeType,
        displayName: req.file.originalname || 'video.mp4'
      });

      fs.unlinkSync(tempFilePath);
      tempFilePath = null;

      // Attendre le traitement
      let file = uploadResult.file;
      geminiFileName = file.name;

      while (file.state === 'PROCESSING') {
        await new Promise(resolve => setTimeout(resolve, 2000));
        file = await fileManager.getFile(file.name);
        sendSSE(res, '.');
      }

      if (file.state === 'FAILED') {
        throw new Error('Le traitement de la video a echoue');
      }

      sendSSE(res, '\n\nExtraction des informations...\n\n');

      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      // Extraire le theme de la video pour le clustering
      const themeResult = await model.generateContent([
        {
          fileData: {
            mimeType: file.mimeType,
            fileUri: file.uri
          }
        },
        {
          text: 'Quel est le theme principal de cette video ? Reponds en une seule phrase courte et concise (maximum 100 caracteres).'
        }
      ]);

      const videoTheme = themeResult.response.text();

      // Envoyer le theme au clustering
      try {
        await processQuestion(videoTheme);
        console.log(`Theme video envoye au clustering: ${videoTheme}`);
      } catch (clusterError) {
        console.error('Erreur clustering theme video:', clusterError);
      }

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

      extractedContent = geminiResult.response.text();

      // Supprimer le fichier de Gemini
      await fileManager.deleteFile(file.name);
      geminiFileName = null;

    } else {
      // Pour les autres fichiers (PDF, documents), on les traite comme du texte
      extractedContent = req.file.buffer.toString('utf-8');
    }

    sendSSE(res, 'Verification des informations...\n\n');

    // Preparer la requete pour Vera
    const veraQuery = isVideo
      ? `Peux-tu verifier les informations contenues dans l'analyse de video suivante :\n\n${extractedContent}`
      : `Peux-tu verifier les informations suivantes :\n\n${extractedContent}`;

    // Appel API Vera (avec le sessionId)
    const veraResponse = await fetch(VERA_API_URL, {
      method: 'POST',
      headers: {
        'X-API-Key': process.env.VERA_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: sessionId,
        query: veraQuery
      })
    });

    if (!veraResponse.ok) {
      throw new Error(`Erreur API Vera: ${veraResponse.status}`);
    }

    const veraAnalysis = await veraResponse.text();

    // Stream la reponse Vera
    await streamVeraResponse(res, veraAnalysis);

    // Sauvegarder la reponse assistant (avec l'ID anonyme de la BDD)
    await query(
      'INSERT INTO chat_messages (user_id, role, content, content_type) VALUES ($1, $2, $3, $4)',
      [dbUserId, 'assistant', veraAnalysis, 'text']
    );

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('Erreur chat stream file:', error);

    // Nettoyage en cas d'erreur
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    if (geminiFileName) {
      try {
        await fileManager.deleteFile(geminiFileName);
      } catch (e) {
        console.error('Erreur suppression fichier Gemini:', e);
      }
    }

    sendSSE(res, { error: error.message || 'Une erreur est survenue lors du traitement du fichier' });
    res.write('data: [DONE]\n\n');
    res.end();
  }
};

// ==========================================
// 3. STREAM CHAT AVEC YOUTUBE
// ==========================================
export const streamChatYouTube = async (req, res) => {
  // Recuperer le sessionId avant de configurer SSE
  const sessionId = getSessionId(req);

  // Configuration SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('X-Session-Id', sessionId);
  res.flushHeaders();

  try {
    const { url } = req.body;
    const dbUserId = await getAnonymousUserId();

    if (!url) {
      sendSSE(res, { error: 'URL YouTube requise' });
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    // Verifier que c'est un lien YouTube valide
    const videoId = extractYouTubeId(url);
    if (!videoId) {
      sendSSE(res, { error: 'Lien YouTube invalide' });
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    // Sauvegarder le message utilisateur
    await query(
      'INSERT INTO chat_messages (user_id, role, content, content_type) VALUES ($1, $2, $3, $4)',
      [dbUserId, 'user', url, 'youtube']
    );

    sendSSE(res, 'Recuperation de la transcription YouTube...\n\n');

    // Recuperer le transcript
    let transcript;
    try {
      const transcripts = await fetchTranscript(videoId);
      transcript = transcripts.map((t) => t.text).join(' ');
    } catch (transcriptError) {
      console.log('youtube-transcript-plus a echoue, tentative avec yt-dlp...', transcriptError);
      sendSSE(res, 'Methode principale echouee, tentative avec methode alternative...\n\n');

      // Fallback avec yt-dlp
      try {
        transcript = fetchTranscriptWithYtDlp(videoId);
        console.log('Transcription recuperee avec yt-dlp');
      } catch (ytdlpError) {
        console.log('yt-dlp a aussi echoue:', ytdlpError);
        sendSSE(res, { error: 'Impossible de recuperer la transcription. La video n\'a peut-etre pas de sous-titres.', transError: transcriptError });
        res.write('data: [DONE]\n\n');
        return res.end();
      }
    }

    if (!transcript || transcript.trim().length === 0) {
      sendSSE(res, { error: 'Aucune transcription disponible pour cette video.' });
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    sendSSE(res, 'Analyse du contenu en cours...\n\n');

    // Preparer la requete pour Vera
    const veraQuery = `Peux-tu verifier les informations contenues dans la transcription de cette video YouTube :\n\n${transcript}`;

    // Fonction pour decouper le texte en parties de 20000 caracteres max
    const splitText = (text, maxLength = 50000) => {
      const parts = [];
      for (let i = 0; i < text.length; i += maxLength) {
        parts.push(text.slice(i, i + maxLength));
      }
      return parts;
    };

    let veraAnalysis = '';

    if (veraQuery.length > 50000) {
      // Decouper et envoyer partie par partie
      const parts = splitText(veraQuery);
      const responses = [];

      for (let i = 0; i < parts.length; i++) {
        const prefix = i > 0 ? '\n\n' : '';
        sendSSE(res, `${prefix}Verification partie ${i + 1}/${parts.length}...\n\n`);

        const partQuery = `[Partie ${i + 1}/${parts.length}]\n\n${parts[i]}`;

        const veraResponse = await fetch(VERA_API_URL, {
          method: 'POST',
          headers: {
            'X-API-Key': process.env.VERA_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userId: sessionId,
            query: partQuery
          })
        });

        if (!veraResponse.ok) {
          throw new Error(`Erreur API Vera (partie ${i + 1}): ${veraResponse.status}`);
        }

        const partResponse = await veraResponse.text();
        responses.push(partResponse);

        // Stream la reponse de cette partie
        await streamVeraResponse(res, `\n\n--- Analyse partie ${i + 1}/${parts.length} ---\n\n`);
        await streamVeraResponse(res, partResponse);
      }

      veraAnalysis = responses.map((r, i) => `[Analyse partie ${i + 1}/${responses.length}]\n${r}`).join('\n\n---\n\n');
    } else {
      // Texte court, envoi direct
      const veraResponse = await fetch(VERA_API_URL, {
        method: 'POST',
        headers: {
          'X-API-Key': process.env.VERA_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: sessionId,
          query: veraQuery
        })
      });

      if (!veraResponse.ok) {
        throw new Error(`Erreur API Vera: ${veraResponse.status}`);
      }

      veraAnalysis = await veraResponse.text();

      // Stream la reponse Vera
      await streamVeraResponse(res, veraAnalysis);
    }

    // Sauvegarder la reponse assistant
    await query(
      'INSERT INTO chat_messages (user_id, role, content, content_type) VALUES ($1, $2, $3, $4)',
      [dbUserId, 'assistant', veraAnalysis, 'text']
    );

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('Erreur chat stream YouTube:', error);
    sendSSE(res, { error: error.message || 'Une erreur est survenue lors du traitement de la video YouTube' });
    res.write('data: [DONE]\n\n');
    res.end();
  }
};

// ==========================================
// 4. HISTORIQUE DES MESSAGES
// ==========================================
export const getChatHistory = async (req, res) => {
  try {
    const userId = req.userId;
    const result = await query(
      'SELECT * FROM chat_messages WHERE user_id = $1 ORDER BY created_at ASC',
      [userId]
    );
    res.json({ messages: result.rows });
  } catch (error) {
    console.error('Erreur historique chat:', error);
    res.status(500).json({ message: 'Erreur lors de la recuperation de l\'historique' });
  }
};

// ==========================================
// 4. EFFACER L'HISTORIQUE
// ==========================================
export const clearChatHistory = async (req, res) => {
  try {
    const userId = req.userId;
    await query('DELETE FROM chat_messages WHERE user_id = $1', [userId]);
    res.json({ message: 'Historique efface' });
  } catch (error) {
    console.error('Erreur suppression historique:', error);
    res.status(500).json({ message: 'Erreur lors de la suppression de l\'historique' });
  }
};
