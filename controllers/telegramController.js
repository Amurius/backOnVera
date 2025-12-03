import { Telegraf, Markup } from 'telegraf';
import { message } from 'telegraf/filters';
import { analyzeText, analyzeImage, analyzeVideo } from './analysisController.js';
import { processVideoBuffer } from '../middlewares/videoprocessor.js';
import { processQuestion } from '../services/clusteringService.js';
import { isDocumentType, extractTextFromDocument, SUPPORTED_DOCUMENT_TYPES } from '../services/documentExtractor.js';
import fetch from 'node-fetch';

// Limite de caractères pour l'API Vera
const MAX_VERA_CONTENT_LENGTH = 50000;

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

class TelegramBotController {
  constructor() {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      throw new Error('TELEGRAM_BOT_TOKEN non configuré dans le fichier .env');
    }
    this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
    this.isRunning = false;
    this.setupMiddleware();
    this.setupHandlers();
  }

  // ==========================================
  // MIDDLEWARE
  // ==========================================
  setupMiddleware() {
    // Middleware pour extraire la langue de l'utilisateur Telegram
    this.bot.use(async (ctx, next) => {
      if (ctx.from) {
        // Extraction de la langue depuis Telegram (ex: "fr", "en", "es")
        ctx.state.lang = ctx.from.language_code || 'xx';
        // Pays par défaut (Telegram ne fournit pas le pays directement)
        ctx.state.country = 'XX';
      }
      return next();
    });

    // Gestion globale des erreurs
    this.bot.catch((err, ctx) => {
      console.error('❌ Erreur Telegraf:', err);
      try {
        ctx.reply('❌ Une erreur est survenue. Veuillez réessayer.');
      } catch (e) {}
    });
  }

  // ==========================================
  // CONFIGURATION DU MENU VISUEL
  // ==========================================
  async setBotCommands() {
    // Affiche le bouton "Menu" à côté de la zone de saisie
    try {
      await this.bot.telegram.setMyCommands([
        { command: 'start', description: '🚀 Démarrer / Redémarrer' },
        { command: 'help', description: '❓ Guide d\'utilisation' },
      ]);
    } catch (error) {
      console.error('Erreur lors de la configuration des commandes:', error);
    }
  }

  // ==========================================
  // SETUP HANDLERS (Commandes & Actions)
  // ==========================================
  setupHandlers() {
    // 1. Commandes principales
    this.bot.command('start', (ctx) => this.handleStart(ctx));
    this.bot.command('help', (ctx) => this.handleHelp(ctx));

    // 2. Gestion des CLICS sur les boutons (Actions)
    this.bot.action('btn_help', (ctx) => {
        ctx.answerCbQuery(); // Stop le chargement du bouton
        return this.handleHelp(ctx);
    });

    // 3. Gestion des fichiers et messages
    this.bot.on(message('text'), (ctx) => this.handleTextMessage(ctx));
    this.bot.on(message('photo'), (ctx) => this.handlePhoto(ctx));
    this.bot.on(message('video'), (ctx) => this.handleVideo(ctx));
    this.bot.on(message('document'), (ctx) => this.handleDocument(ctx));
  }

  // ==========================================
  // HELPERS
  // ==========================================
  createMockRequest(body = {}, file = null, frames = null, audio = null) {
    return { body, file, frames, audio };
  }

  createMockResponse(ctx) {
    return {
      status: (code) => ({
        json: (data) => {
          ctx.reply(`❌ Erreur ${code}: ${data.message}`);
        }
      }),
      json: async (data) => {
        if (data.veraAnalysis) {
          await ctx.reply(`✅ <b>Analyse Vera terminée</b>\n\n${data.veraAnalysis}`, { parse_mode: 'HTML' });
        } else if (data.extractedText) {
          await ctx.reply('📄 <b>Envoi à Vera pour vérification...</b>');
          await this.sendToVera(ctx, data.extractedText);
        } else if (data.videoAnalysis) {
          await ctx.reply('🎬 <b>Envoi à Vera pour vérification...</b>');
          await this.sendToVera(ctx, data.videoAnalysis);
        } else {
          await ctx.reply(`✅ ${data.message}`);
        }
      }
    };
  }

  async sendToVera(ctx, text) {
    try {
      const mockReq = this.createMockRequest({ text });
      const mockRes = this.createMockResponse(ctx);
      await analyzeText(mockReq, mockRes);
    } catch (error) {
      console.error('Erreur analyse Vera:', error);
      await ctx.reply('❌ Erreur lors de l\'analyse avec Vera');
    }
  }

  // ==========================================
  // COMMAND HANDLERS (Optimisés UX)
  // ==========================================

  async handleStart(ctx) {
    const welcomeMessage = `
👋 <b>Bonjour ${ctx.from.first_name || 'cher utilisateur'} !</b>

Bienvenue sur <b>Vera.</b> Je suis prêt à analyser tous vos contenus.

🚀 <b>Comment ça marche ?</b>

Envoyez-moi simplement :

📝 <b>Du texte</b> pour une analyse sémantique,

🖼️ <b>Une image</b> pour extraire le texte,

🎥 <b>Une vidéo</b> pour une analyse visuelle,

<b>Que souhaitez-vous faire ?</b>
    `;

    // Clavier Interactif (Boutons)
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('❓ Comment m\'utiliser ? ❓', 'btn_help')]
    ]);

    return ctx.reply(welcomeMessage, { parse_mode: 'HTML', ...keyboard });
  }

  async handleHelp(ctx) {
    const helpMessage = `
📖 <b>Guide d'utilisation Rapide</b>

1️⃣ <b>Analyse de Texte :</b>
Écrivez simplement votre message dans le chat et envoyez-le.

2️⃣ <b>Analyse d'Image (OCR) :</b>
Cliquez sur le trombone 📎 > Galerie/Fichier > Sélectionnez votre image.

3️⃣ <b>Analyse Vidéo :</b>
Cliquez sur le trombone 📎 > Vidéo > Sélectionnez (Max 20MB).

💡 <i>Conseil : Pour de meilleurs résultats, utilisez des images/vidéos claires avec du texte lisible.</i>
    `;
    return ctx.reply(helpMessage, { parse_mode: 'HTML' });
  }

  // ==========================================
  // MESSAGE HANDLERS
  // ==========================================
  async handleTextMessage(ctx) {
    try {
      const textToAnalyze = ctx.message.text;
      const country = ctx.state.country;
      const lang = ctx.state.lang;

      await ctx.reply('⏳ <b>Analyse en cours avec Vera...</b>', { parse_mode: 'HTML' });

      // Enregistrement de la question avec pays et langue (clustering)
      processQuestion(textToAnalyze, country, lang)
        .then(() => console.log('✅ Question Telegram traitée (Clustering + DB)'))
        .catch(err => console.error('⚠️ Erreur traitement question Telegram:', err.message));

      const mockReq = this.createMockRequest({ text: textToAnalyze });
      const mockRes = this.createMockResponse(ctx);
      await analyzeText(mockReq, mockRes);
    } catch (error) {
      console.error('Erreur analyse texte:', error);
      await ctx.reply('❌ Erreur de l\'analyse du texte');
    }
  }

  async handlePhoto(ctx) {
    try {
      const country = ctx.state.country;
      const lang = ctx.state.lang;
      // Récupération de la caption (texte envoyé avec l'image)
      const userQuestion = ctx.message.caption || '';

      await ctx.reply('⏳ <b>Téléchargement...</b>', { parse_mode: 'HTML' });
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      const fileLink = await ctx.telegram.getFileLink(photo.file_id);
      const response = await fetch(fileLink.href);
      const buffer = Buffer.from(await response.arrayBuffer());

      await ctx.reply('🖼️ <b>OCR en cours...</b>', { parse_mode: 'HTML' });

      // Enregistrement de la question utilisateur si présente, sinon de l'analyse
      if (userQuestion.trim()) {
        processQuestion(userQuestion.trim(), country, lang)
          .then(() => console.log('✅ Question image Telegram traitée'))
          .catch(err => console.error('⚠️ Erreur stats image Telegram:', err.message));
      } else {
        processQuestion('Analyse image Telegram', country, lang)
          .catch(err => console.error('⚠️ Erreur stats image Telegram:', err.message));
      }

      // Passage de la question utilisateur dans le body pour le traitement
      const mockReq = this.createMockRequest({ userQuestion: userQuestion.trim() }, { buffer, mimetype: 'image/jpeg' });
      const mockRes = this.createMockResponse(ctx);
      await analyzeImage(mockReq, mockRes);
    } catch (error) {
      console.error('Erreur analyse image:', error);
      await ctx.reply('❌ Erreur de l\'analyse d\'image');
    }
  }

  async handleVideo(ctx) {
    try {
      const video = ctx.message.video;
      const country = ctx.state.country;
      const lang = ctx.state.lang;
      // Récupération de la caption (texte envoyé avec la vidéo)
      const userQuestion = ctx.message.caption || '';

      if (video.file_size > 20 * 1024 * 1024) {
        return ctx.reply('⚠️ Vidéo trop volumineuse (max 20MB).');
      }

      await ctx.reply('⏳ <b>Téléchargement...</b>', { parse_mode: 'HTML' });
      const fileLink = await ctx.telegram.getFileLink(video.file_id);
      const response = await fetch(fileLink.href);
      const buffer = Buffer.from(await response.arrayBuffer());

      await ctx.reply('🎬 <b>Analyse vidéo en cours...</b>', { parse_mode: 'HTML' });

      // Enregistrement de la question utilisateur si présente, sinon de l'analyse
      if (userQuestion.trim()) {
        processQuestion(userQuestion.trim(), country, lang)
          .then(() => console.log('✅ Question vidéo Telegram traitée'))
          .catch(err => console.error('⚠️ Erreur stats vidéo Telegram:', err.message));
      } else {
        processQuestion('Analyse vidéo Telegram', country, lang)
          .catch(err => console.error('⚠️ Erreur stats vidéo Telegram:', err.message));
      }

      // Passage de la question utilisateur dans le body
      const mockReq = this.createMockRequest({ userQuestion: userQuestion.trim() });
      mockReq.file = {
        buffer,
        mimetype: video.mime_type || 'video/mp4',
        originalname: `tg_vid_${Date.now()}.mp4`
      };

      await processVideoBuffer(mockReq, buffer);

      if (!mockReq.frames || !mockReq.frames.length) {
        return ctx.reply('❌ Erreur extraction frames.');
      }

      const mockRes = this.createMockResponse(ctx);
      await analyzeVideo(mockReq, mockRes);
    } catch (error) {
      console.error('Erreur analyse vidéo:', error);
      await ctx.reply(`❌ Erreur: ${error.message}`);
    }
  }

  async handleDocument(ctx) {
    const doc = ctx.message.document;
    const mimeType = doc.mime_type || '';
    const country = ctx.state.country;
    const lang = ctx.state.lang;
    const userQuestion = ctx.message.caption || '';

    // Cas 1 : Image envoyée comme document
    if (mimeType.startsWith('image/')) {
      try {
        await ctx.reply('⏳ <b>Téléchargement...</b>', { parse_mode: 'HTML' });
        const fileLink = await ctx.telegram.getFileLink(doc.file_id);
        const response = await fetch(fileLink.href);
        const buffer = Buffer.from(await response.arrayBuffer());

        await ctx.reply('🖼️ <b>OCR en cours...</b>', { parse_mode: 'HTML' });

        // Enregistrement de la question utilisateur si présente, sinon de l'analyse
        if (userQuestion.trim()) {
          processQuestion(userQuestion.trim(), country, lang)
            .then(() => console.log('✅ Question document Telegram traitée'))
            .catch(err => console.error('⚠️ Erreur stats document Telegram:', err.message));
        } else {
          processQuestion('Analyse document image Telegram', country, lang)
            .catch(err => console.error('⚠️ Erreur stats document Telegram:', err.message));
        }

        const mockReq = this.createMockRequest({ userQuestion: userQuestion.trim() }, { buffer, mimetype: mimeType });
        const mockRes = this.createMockResponse(ctx);
        await analyzeImage(mockReq, mockRes);
      } catch (error) {
        console.error('Erreur doc image:', error);
        await ctx.reply('❌ Erreur lors de l\'analyse de l\'image');
      }
    }
    // Cas 2 : Document texte (PDF, Word, ODT, etc.)
    else if (isDocumentType(mimeType)) {
      try {
        await ctx.reply('⏳ <b>Téléchargement du document...</b>', { parse_mode: 'HTML' });
        const fileLink = await ctx.telegram.getFileLink(doc.file_id);
        const response = await fetch(fileLink.href);
        const buffer = Buffer.from(await response.arrayBuffer());

        await ctx.reply('📄 <b>Extraction du texte en cours...</b>', { parse_mode: 'HTML' });

        // Extraction du texte du document
        const extractionResult = await extractTextFromDocument(buffer, mimeType);

        if (!extractionResult.success) {
          await ctx.reply(`❌ Erreur: ${extractionResult.error || 'Impossible d\'extraire le texte du document'}`);
          return;
        }

        const extractedText = extractionResult.text;

        if (!extractedText || extractedText.trim().length === 0) {
          await ctx.reply('⚠️ Aucun texte trouvé dans le document.');
          return;
        }

        // Enregistrement de la question utilisateur si présente
        if (userQuestion.trim()) {
          processQuestion(userQuestion.trim(), country, lang)
            .then(() => console.log('✅ Question document texte Telegram traitée'))
            .catch(err => console.error('⚠️ Erreur stats document Telegram:', err.message));
        } else {
          // Enregistrer un résumé du document pour les stats
          const docSummary = extractedText.substring(0, 200).replace(/\s+/g, ' ').trim();
          processQuestion(`Document: ${docSummary}`, country, lang)
            .catch(err => console.error('⚠️ Erreur stats document Telegram:', err.message));
        }

        await ctx.reply('🔍 <b>Envoi à Vera pour vérification...</b>', { parse_mode: 'HTML' });

        // Découper le texte en morceaux pour respecter les limites de l'API
        const textChunks = splitTextIntoChunks(extractedText);
        const totalChunks = textChunks.length;

        // Envoyer chaque morceau à Vera
        for (let i = 0; i < totalChunks; i++) {
          const chunk = textChunks[i];
          const isFirstChunk = i === 0;
          const isLastChunk = i === totalChunks - 1;

          // Indiquer la progression si plusieurs morceaux
          if (totalChunks > 1) {
            await ctx.reply(`📄 <b>Partie ${i + 1}/${totalChunks}</b>`, { parse_mode: 'HTML' });
          }

          // Construction de la requête Vera
          let veraQuery = '';
          if (isFirstChunk) {
            if (userQuestion.trim()) {
              veraQuery = `Question utilisateur : "${userQuestion.trim()}"\n\nContenu du document :\n${chunk}`;
            } else {
              veraQuery = `Peux-tu vérifier les informations contenues dans ce document :\n\n${chunk}`;
            }
            if (totalChunks > 1) {
              veraQuery += `\n\n[Suite du contenu à venir - Partie 1/${totalChunks}]`;
            }
          } else {
            veraQuery = `Suite du document (Partie ${i + 1}/${totalChunks}) :\n\n${chunk}`;
            if (!isLastChunk) {
              veraQuery += `\n\n[Suite à venir]`;
            } else {
              veraQuery += `\n\n[Fin du document - Merci de fournir une analyse complète]`;
            }
          }

          // Envoi à Vera
          const mockReq = this.createMockRequest({ text: veraQuery });
          const mockRes = this.createMockResponse(ctx);
          await analyzeText(mockReq, mockRes);
        }

      } catch (error) {
        console.error('Erreur doc texte:', error);
        await ctx.reply('❌ Erreur lors de l\'analyse du document');
      }
    }
    // Cas 3 : Format non supporté
    else {
      const supportedFormats = Object.values(SUPPORTED_DOCUMENT_TYPES).join(', ').toUpperCase();
      await ctx.reply(`⚠️ Format non supporté.\n\nFormats acceptés :\n📷 Images (JPG, PNG)\n🎥 Vidéos (MP4, max 20MB)\n📄 Documents (${supportedFormats})`);
    }
  }

  // ==========================================
  // WEBHOOK & PROCESS
  // ==========================================
  async handleWebhook(req, res) {
    try {
      await this.bot.handleUpdate(req.body, res);
      if (!res.headersSent) res.status(200).send('OK');
    } catch (error) {
      console.error('❌ Erreur Webhook Handler:', error);
      if (!res.headersSent) res.status(200).send('Error');
    }
  }

  async startWebhook() {
    const domain = process.env.DOMAIN_URL;
    if (!domain) {
      console.error('❌ ERREUR: DOMAIN_URL manquant');
      return;
    }

    const webhookUrl = `${domain}/api/telegram/webhook`;
    
    try {
      await this.bot.telegram.deleteWebhook();
      
      // Initialisation du menu de commandes au démarrage
      await this.setBotCommands(); 

      const success = await this.bot.telegram.setWebhook(webhookUrl);
      
      if (success) {
        this.isRunning = true;
        console.log('✅ Webhook Telegram configuré et Menu actif !');
      }
    } catch (error) {
      console.error('❌ Erreur setWebhook:', error.message);
    }
  }

  async startPolling() {
    try {
      await this.bot.telegram.deleteWebhook();
      
      // Initialisation du menu de commandes au démarrage
      await this.setBotCommands();

      this.bot.launch();
      this.isRunning = true;
      console.log('✅ Bot Telegram connecté en Polling avec Menu !');
    } catch (error) {
      console.error('❌ Erreur startPolling:', error);
    }
  }

  stop(signal) {
    this.bot.stop(signal);
    this.isRunning = false;
    console.log('🛑 Bot Telegram arrêté');
  }
}

export default new TelegramBotController();