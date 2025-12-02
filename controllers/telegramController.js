import { Telegraf, Markup } from 'telegraf';
import { message } from 'telegraf/filters';
import { analyzeText, analyzeImage, analyzeVideo } from './analysisController.js';
import { query } from '../db/config.js';
import { processVideoBuffer } from '../middlewares/videoprocessor.js';
import fetch from 'node-fetch';

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
    // Middleware pour gérer userId
    this.bot.use(async (ctx, next) => {
      if (ctx.from) {
        try {
          ctx.state.userId = await this.getUserId(ctx.from.id, ctx.from.username);
        } catch (error) {
          console.error('Erreur middleware userId:', error);
        }
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
    // Cela affiche le bouton "Menu" à côté de la zone de saisie
    try {
      await this.bot.telegram.setMyCommands([
        { command: 'start', description: '🚀 Démarrer / Redémarrer' },
        { command: 'help', description: '❓ Guide d\'utilisation' },
        { command: 'history_ocr', description: '📄 Mes analyses d\'images' },
        { command: 'history_video', description: '🎬 Mes analyses vidéos' },
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
    this.bot.command('history_ocr', (ctx) => this.handleHistoryOcr(ctx));
    this.bot.command('history_video', (ctx) => this.handleHistoryVideo(ctx));

    // 2. Gestion des CLICS sur les boutons (Actions)
    // Cela permet de réagir quand l'utilisateur clique sur le menu de bienvenue
    this.bot.action('btn_help', (ctx) => {
        ctx.answerCbQuery(); // Stop le chargement du bouton
        return this.handleHelp(ctx);
    });
    
    this.bot.action('btn_hist_ocr', (ctx) => {
        ctx.answerCbQuery();
        return this.handleHistoryOcr(ctx);
    });

    this.bot.action('btn_hist_video', (ctx) => {
        ctx.answerCbQuery();
        return this.handleHistoryVideo(ctx);
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
  async getUserId(telegramId, username) {
    try {
      let result = await query(
        'SELECT id FROM users WHERE telegram_id = $1',
        [telegramId]
      );

      if (result.rows.length > 0) {
        return result.rows[0].id;
      }

      result = await query(
        'INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id',
        [telegramId, username || `telegram_${telegramId}`]
      );

      return result.rows[0].id;
    } catch (error) {
      console.error('Erreur getUserId:', error);
      throw error;
    }
  }

  createMockRequest(userId, body = {}, file = null, frames = null, audio = null) {
    return { userId, body, file, frames, audio };
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
          await ctx.reply('📄 <b>Texte extrait de l\'image</b>\n\nEnvoi à Vera pour vérification...');
          await this.sendToVera(ctx, data.extractedText);
        } else if (data.videoAnalysis) {
          await ctx.reply('🎬 <b>Vidéo analysée</b>\n\nEnvoi à Vera pour vérification...');
          await this.sendToVera(ctx, data.videoAnalysis);
        } else if (data.analyses) {
          await this.formatHistory(ctx, data.analyses);
        } else {
          await ctx.reply(`✅ ${data.message}`);
        }
      }
    };
  }

  async sendToVera(ctx, text) {
    try {
      const mockReq = this.createMockRequest(ctx.state.userId, { text });
      const mockRes = this.createMockResponse(ctx);
      await analyzeText(mockReq, mockRes);
    } catch (error) {
      console.error('Erreur analyse Vera:', error);
      await ctx.reply('❌ Erreur lors de l\'analyse avec Vera');
    }
  }

  async formatHistory(ctx, analyses) {
    if (!analyses || analyses.length === 0) {
      return ctx.reply('ℹ️ Aucune analyse trouvée dans votre historique.');
    }
    let message = `📊 <b>Historique de vos analyses (${analyses.length} dernières)</b>\n\n`;
    analyses.slice(0, 5).forEach((analysis, index) => {
      const date = new Date(analysis.created_at).toLocaleString('fr-FR');
      const preview = analysis.extracted_text 
        ? analysis.extracted_text.substring(0, 80) 
        : analysis.video_analysis?.substring(0, 80) || 'N/A';
      message += `${index + 1}. <b>${date}</b>\n   ${preview}...\n\n`;
    });
    await ctx.reply(message, { parse_mode: 'HTML' });
  }

  // ==========================================
  // COMMAND HANDLERS (Optimisés UX)
  // ==========================================
  
  async handleStart(ctx) {
    const welcomeMessage = `
👋 <b>Bonjour ${ctx.from.first_name || 'cher utilisateur'} !</b>

Bienvenue sur <b>Vera.</b>   Je suis prêt à analyser tous vos contenus.

🚀 <b>Comment ça marche ?</b>

Envoyez-moi simplement :

📝 <b>Du texte</b> pour une analyse sémantique,

🖼️ <b>Une image</b> pour extraire le texte,

🎥 <b>Une vidéo</b> pour une analyse visuelle,

<b> Que souhaitez-vous faire ?</b>
    `;

    // Clavier Interactif (Boutons)
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('❓ Comment m\'utiliser ? ❓'  , 'btn_help')],
        [
            Markup.button.callback('📄 Historique Images', 'btn_hist_ocr'),
            Markup.button.callback('🎬 Historique Vidéos', 'btn_hist_video')
        ]
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

  async handleHistoryOcr(ctx) {
    try {
      await ctx.reply('🔍 <i>Recherche de votre historique d\'images...</i>', { parse_mode: 'HTML' });
      const result = await query(
        'SELECT * FROM ocr_analyses WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5',
        [ctx.state.userId]
      );
      await this.formatHistory(ctx, result.rows);
    } catch (error) {
      console.error('Erreur history OCR:', error);
      await ctx.reply('❌ Erreur historique images.');
    }
  }

  async handleHistoryVideo(ctx) {
    try {
      await ctx.reply('🔍 <i>Recherche de votre historique vidéo...</i>', { parse_mode: 'HTML' });
      const result = await query(
        'SELECT * FROM video_analyses WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5',
        [ctx.state.userId]
      );
      await this.formatHistory(ctx, result.rows);
    } catch (error) {
      console.error('Erreur history vidéo:', error);
      await ctx.reply('❌ Erreur historique vidéo.');
    }
  }

  // ==========================================
  // MESSAGE HANDLERS
  // ==========================================
  async handleTextMessage(ctx) {
    try {
      await ctx.reply('⏳ <b>Analyse en cours avec Vera...</b>', { parse_mode: 'HTML' });
      const mockReq = this.createMockRequest(ctx.state.userId, { text: ctx.message.text });
      const mockRes = this.createMockResponse(ctx);
      await analyzeText(mockReq, mockRes);
    } catch (error) {
      console.error('Erreur analyse texte:', error);
      await ctx.reply('❌ Erreur de l\'analyse du texte');
    }
  }

  async handlePhoto(ctx) {
    try {
      await ctx.reply('⏳ <b>Téléchargement...</b>', { parse_mode: 'HTML' });
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      const fileLink = await ctx.telegram.getFileLink(photo.file_id);
      const response = await fetch(fileLink.href);
      const buffer = Buffer.from(await response.arrayBuffer());
      
      await ctx.reply('🖼️ <b>OCR en cours...</b>', { parse_mode: 'HTML' });
      
      const mockReq = this.createMockRequest(ctx.state.userId, {}, { buffer, mimetype: 'image/jpeg' });
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
      if (video.file_size > 20 * 1024 * 1024) {
        return ctx.reply('⚠️ Vidéo trop volumineuse (max 20MB).');
      }
      
      await ctx.reply('⏳ <b>Téléchargement...</b>', { parse_mode: 'HTML' });
      const fileLink = await ctx.telegram.getFileLink(video.file_id);
      const response = await fetch(fileLink.href);
      const buffer = Buffer.from(await response.arrayBuffer());
      
      await ctx.reply('🎬 <b>Analyse vidéo en cours...</b>', { parse_mode: 'HTML' });
      
      const mockReq = this.createMockRequest(ctx.state.userId);
      mockReq.file = { 
        buffer, 
        mimetype: video.mime_type || 'video/mp4', 
        originalname: `tg_vid_${Date.now()}.mp4` 
      };
      
      await processVideoBuffer(mockReq, buffer);
      
      if (!mockReq.frames?.length) return ctx.reply('❌ Erreur extraction frames.');
      
      const mockRes = this.createMockResponse(ctx);
      await analyzeVideo(mockReq, mockRes);
    } catch (error) {
      console.error('Erreur analyse vidéo:', error);
      await ctx.reply(`❌ Erreur: ${error.message}`);
    }
  }

  async handleDocument(ctx) {
    const doc = ctx.message.document;
    if (doc.mime_type && doc.mime_type.startsWith('image/')) {
      try {
        await ctx.reply('⏳ <b>Téléchargement...</b>', { parse_mode: 'HTML' });
        const fileLink = await ctx.telegram.getFileLink(doc.file_id);
        const response = await fetch(fileLink.href);
        const buffer = Buffer.from(await response.arrayBuffer());
        
        await ctx.reply('🖼️ <b>OCR en cours...</b>', { parse_mode: 'HTML' });
        const mockReq = this.createMockRequest(ctx.state.userId, {}, { buffer, mimetype: doc.mime_type });
        const mockRes = this.createMockResponse(ctx);
        await analyzeImage(mockReq, mockRes);
      } catch (error) {
        console.error('Erreur doc:', error);
        await ctx.reply('❌ Erreur document');
      }
    } else {
      await ctx.reply('⚠️ Envoyez une image (JPG, PNG) ou une vidéo.');
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