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

const getSessionId = (req) => {
  const sessionId = req.headers['x-session-id'] || req.body?.sessionId;
  if (sessionId) {
    return sessionId;
  }
  return crypto.randomUUID();
};

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

const isYouTubeUrl = (url) => {
  return extractYouTubeId(url) !== null;
};

const fetchTranscriptWithYtDlp = (videoId) => {
  const tempDir = os.tmpdir();
  const outputPath = path.join(tempDir, `yt-${videoId}`);

  try {
    execSync(
      `yt-dlp --skip-download --write-auto-sub --write-sub --sub-lang fr,en --sub-format vtt -o "${outputPath}" "https://www.youtube.com/watch?v=${videoId}"`,
      { stdio: 'pipe', timeout: 60000 }
    );

    const files = fs.readdirSync(tempDir);
    const subtitleFile = files.find(f => f.startsWith(`yt-${videoId}`) && (f.endsWith('.vtt') || f.endsWith('.srt')));

    if (!subtitleFile) {
      throw new Error('Aucun fichier de sous-titres trouve');
    }

    const subtitlePath = path.join(tempDir, subtitleFile);
    const content = fs.readFileSync(subtitlePath, 'utf-8');

    fs.unlinkSync(subtitlePath);

    const lines = content.split('\n');
    const textLines = lines.filter(line => {
      return line.trim() &&
             !line.match(/^\d+$/) &&
             !line.match(/^WEBVTT/) &&
             !line.match(/^\d{2}:\d{2}/) &&
             !line.match(/-->/);
    });

    const cleanText = textLines
      .map(line => line.replace(/<[^>]+>/g, '').trim())
      .filter(line => line.length > 0)
      .join(' ');

    return cleanText;
  } catch (error) {
    try {
      const files = fs.readdirSync(tempDir);
      files.filter(f => f.startsWith(`yt-${videoId}`)).forEach(f => {
        fs.unlinkSync(path.join(tempDir, f));
      });
    } catch (e) {}

    throw error;
  }
};

const sendSSE = (res, data) => {
  if (typeof data === 'string') {
    res.write(`data: ${JSON.stringify({ content: data })}\n\n`);
  } else {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }
};

const streamVeraResponse = async (res, veraText, chunkSize = 5, delay = 20) => {
  for (let i = 0; i < veraText.length; i += chunkSize) {
    const chunk = veraText.slice(i, i + chunkSize);
    sendSSE(res, chunk);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
};

// ==========================================
// 1. STREAM CHAT (Texte) - CORRIGÉ 
// ==========================================
export const streamChat = async (req, res) => {
  const sessionId = getSessionId(req);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('X-Session-Id', sessionId);
  res.flushHeaders();

  try {
    const { content, message, country, lang } = req.body;
    const textToProcess = content || message;

    const dbUserId = await getAnonymousUserId();

    if (!textToProcess) {
      sendSSE(res, { error: 'Contenu requis' });
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    // =========================================================
    // 👇 CORRECTION MAJEURE ICI 👇
    // =========================================================
    // On a supprimé l'INSERT manuel qui créait des doublons vides.
    // On délègue TOUT à processQuestion : Sauvegarde + Clustering + Pays + Langue
    
    // On lance le traitement en arrière-plan ("Fire and forget")
    // On passe bien country et lang pour qu'ils soient enregistrés avec le cluster
    processQuestion(textToProcess, country || 'XX', lang || 'xx')
      .then(() => console.log('✅ Question traitée (Clustering + DB)'))
      .catch(err => console.error('⚠️ Erreur traitement question:', err.message));

    // =========================================================

    // 2. Sauvegarder le message utilisateur (Historique Chat)
    await query(
      'INSERT INTO chat_messages (user_id, role, content, content_type) VALUES ($1, $2, $3, $4)',
      [dbUserId, 'user', textToProcess, 'text']
    );

    // 3. Appel API Vera
    const veraResponse = await fetch(VERA_API_URL, {
      method: 'POST',
      headers: {
        'X-API-Key': process.env.VERA_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: sessionId,
        query: textToProcess
      })
    });

    if (!veraResponse.ok) {
      throw new Error(`Erreur API Vera: ${veraResponse.status}`);
    }

    let veraAnalysis = '';
    const contentType = veraResponse.headers.get('content-type') || '';

    if (contentType.includes('text/event-stream') || contentType.includes('stream')) {
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
      console.log('MODE: POST classique (simulation streaming)');
      veraAnalysis = await veraResponse.text();
      await streamVeraResponse(res, veraAnalysis);
    }

    // 4. Sauvegarder la reponse assistant
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
  const sessionId = getSessionId(req);

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

    const { country, lang } = req.body;
    const dbUserId = await getAnonymousUserId();
    const fileType = req.body.type || 'file';
    const mimeType = req.file.mimetype;
    const isVideo = mimeType.startsWith('video/');
    const isImage = mimeType.startsWith('image/');

    let extractedContent = '';

    // Ici on garde l'insert manuel juste pour logger le nom du fichier (sans cluster, c'est normal)
    try {
        await query(
          `INSERT INTO user_questions 
           (question_text, normalized_text, country, language, created_at) 
           VALUES ($1, $2, $3, $4, NOW())`,
          [
            `Fichier: ${req.file.originalname}`, 
            `fichier: ${req.file.originalname.toLowerCase()}`, 
            country || 'XX', 
            lang || 'xx'
          ]
        );
    } catch(e) { console.error("Erreur stats fichier", e); }

    await query(
      'INSERT INTO chat_messages (user_id, role, content, content_type, file_name) VALUES ($1, $2, $3, $4, $5)',
      [dbUserId, 'user', isVideo ? 'Video envoyee' : 'Fichier envoye', fileType, req.file.originalname]
    );

    sendSSE(res, 'Analyse du fichier en cours...\n\n');

    if (isImage) {
      const base64Image = req.file.buffer.toString('base64');

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

      // Envoyer le theme au clustering AVEC PAYS ET LANGUE
      try {
        await processQuestion(imageTheme, country || 'XX', lang || 'xx');
        console.log(`Theme image clustérisé: ${imageTheme}`);
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
                text: 'Extrais toutes les informations factuelles...'
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
      tempFilePath = path.join(os.tmpdir(), `video-${Date.now()}.mp4`);
      fs.writeFileSync(tempFilePath, req.file.buffer);

      const uploadResult = await fileManager.uploadFile(tempFilePath, {
        mimeType: mimeType,
        displayName: req.file.originalname || 'video.mp4'
      });

      fs.unlinkSync(tempFilePath);
      tempFilePath = null;

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

      const themeResult = await model.generateContent([
        {
          fileData: { mimeType: file.mimeType, fileUri: file.uri }
        },
        {
          text: 'Quel est le theme principal de cette video ? Reponds en une seule phrase courte et concise.'
        }
      ]);

      const videoTheme = themeResult.response.text();

      // Envoyer le theme au clustering AVEC PAYS ET LANGUE
      try {
        await processQuestion(videoTheme, country || 'XX', lang || 'xx');
        console.log(`Theme video clustérisé: ${videoTheme}`);
      } catch (clusterError) {
        console.error('Erreur clustering theme video:', clusterError);
      }

      const geminiResult = await model.generateContent([
        {
          fileData: { mimeType: file.mimeType, fileUri: file.uri }
        },
        {
          text: `Analyse cette video en detail...`
        }
      ]);

      extractedContent = geminiResult.response.text();
      await fileManager.deleteFile(file.name);
      geminiFileName = null;

    } else {
      extractedContent = req.file.buffer.toString('utf-8');
    }

    sendSSE(res, 'Verification des informations...\n\n');

    const veraQuery = isVideo
      ? `Peux-tu verifier les informations contenues dans l'analyse de video suivante :\n\n${extractedContent}`
      : `Peux-tu verifier les informations suivantes :\n\n${extractedContent}`;

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
    await streamVeraResponse(res, veraAnalysis);

    await query(
      'INSERT INTO chat_messages (user_id, role, content, content_type) VALUES ($1, $2, $3, $4)',
      [dbUserId, 'assistant', veraAnalysis, 'text']
    );

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('Erreur chat stream file:', error);
    if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    if (geminiFileName) try { await fileManager.deleteFile(geminiFileName); } catch (e) {}

    sendSSE(res, { error: error.message || 'Erreur traitement fichier' });
    res.write('data: [DONE]\n\n');
    res.end();
  }
};

// ... La suite (streamChatYouTube, etc.) reste identique ...
export const streamChatYouTube = async (req, res) => {
  const sessionId = getSessionId(req);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('X-Session-Id', sessionId);
  res.flushHeaders();

  try {
    const { url, country, lang } = req.body;
    const dbUserId = await getAnonymousUserId();

    if (!url) {
      sendSSE(res, { error: 'URL YouTube requise' });
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    const videoId = extractYouTubeId(url);
    if (!videoId) {
      sendSSE(res, { error: 'Lien YouTube invalide' });
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    // Sauvegarde Stats (Pas de clustering sur l'URL brute, on pourrait le faire sur le transcript plus tard)
    try {
        await query(
          `INSERT INTO user_questions 
           (question_text, normalized_text, country, language, created_at) 
           VALUES ($1, $2, $3, $4, NOW())`,
          [url, url.toLowerCase(), country || 'XX', lang || 'xx']
        );
    } catch(e) { console.error("Erreur stats youtube", e); }

    await query(
      'INSERT INTO chat_messages (user_id, role, content, content_type) VALUES ($1, $2, $3, $4)',
      [dbUserId, 'user', url, 'youtube']
    );

    sendSSE(res, 'Recuperation de la transcription YouTube...\n\n');

    let transcript;
    try {
      const transcripts = await fetchTranscript(videoId);
      transcript = transcripts.map((t) => t.text).join(' ');
    } catch (transcriptError) {
      sendSSE(res, 'Methode principale echouee, tentative avec methode alternative...\n\n');
      try {
        transcript = fetchTranscriptWithYtDlp(videoId);
      } catch (ytdlpError) {
        sendSSE(res, { error: 'Impossible de recuperer la transcription.' });
        res.write('data: [DONE]\n\n');
        return res.end();
      }
    }

    if (!transcript || transcript.trim().length === 0) {
      sendSSE(res, { error: 'Aucune transcription disponible.' });
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    sendSSE(res, 'Analyse du contenu en cours...\n\n');

    const veraQuery = `Peux-tu verifier les informations contenues dans la transcription de cette video YouTube :\n\n${transcript}`;

    // Ici on simplifie pour l'exemple, tu garderas ta logique de splitText si besoin
    const veraResponse = await fetch(VERA_API_URL, {
      method: 'POST',
      headers: {
        'X-API-Key': process.env.VERA_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ userId: sessionId, query: veraQuery })
    });

    if (!veraResponse.ok) throw new Error(`Erreur API Vera: ${veraResponse.status}`);

    const veraAnalysis = await veraResponse.text();
    await streamVeraResponse(res, veraAnalysis);

    await query(
      'INSERT INTO chat_messages (user_id, role, content, content_type) VALUES ($1, $2, $3, $4)',
      [dbUserId, 'assistant', veraAnalysis, 'text']
    );

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('Erreur chat stream YouTube:', error);
    sendSSE(res, { error: error.message });
    res.write('data: [DONE]\n\n');
    res.end();
  }
};

export const getChatHistory = async (req, res) => {
  try {
    const userId = await getAnonymousUserId();
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

export const clearChatHistory = async (req, res) => {
  try {
    const userId = await getAnonymousUserId();
    await query('DELETE FROM chat_messages WHERE user_id = $1', [userId]);
    res.json({ message: 'Historique efface' });
  } catch (error) {
    console.error('Erreur suppression historique:', error);
    res.status(500).json({ message: 'Erreur lors de la suppression de l\'historique' });
  }
};