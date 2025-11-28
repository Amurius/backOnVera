import { query } from '../db/config.js';

// Fonction simulée pour répondre (Car l'API d'envoi nécessite un Token OAuth complexe)
// Dans une vraie prod, on utiliserait l'API 'POST /v2/message/send'
async function sendReplyToTikTok(senderId, text) {
  console.log("📤 [TikTok] Tentative d'envoi de réponse...");
  console.log(`👉 À : ${senderId}`);
  console.log(`👉 Message : "${text}"`);
  // Ici, on mettrait le fetch vers l'API TikTok si on avait le Token
}

export const handleTikTokWebhook = async (req, res) => {
  try {
    const body = req.body;

    // ============================================================
    // 1. LA VÉRIFICATION (Le "Challenge" de TikTok) - VITAL !
    // ============================================================
    // Sans ça, le bouton "Verify" restera rouge à jamais.
    if (body.challenge) {
      console.log("🟢 TikTok demande une vérification !");
      console.log("Code Challenge reçu :", body.challenge);
      
      // On renvoie le code tel quel pour prouver qu'on est bien le serveur
      return res.json({ challenge: body.challenge });
    }

    // ============================================================
    // 2. RÉCEPTION DES MESSAGES (L'Écoute)
    // ============================================================
    console.log("📨 Webhook TikTok reçu :", JSON.stringify(body, null, 2));

    // Structure typique d'un événement TikTok (peut varier selon la version API)
    const event = body.entry?.[0]?.changes?.[0]?.value;

    if (event) {
      const senderId = event.sender_id || event.from_id;
      
      // Cas : On reçoit une vidéo partagée
      if (event.message_type === 'video_share' || event.item_type === 101) { // 101 = Video share code
        const videoUrl = event.link || event.share_url;
        console.log(`🎥 Vidéo reçue de ${senderId} : ${videoUrl}`);

        // ICI : On lancerait l'analyse Vera (FFmpeg + OpenAI)
        // Pour l'instant, on log juste pour la démo
        console.log("🧠 Vera analyse la vidéo...");
        
        // Simulation réponse
        await sendReplyToTikTok(senderId, "🤖 Vera a bien reçu votre vidéo. Analyse en cours...");
      }
      
      // Cas : On reçoit du texte
      else if (event.text) {
        console.log(`💬 Texte reçu : "${event.text}"`);
      }
    }

    // Toujours répondre 200 OK rapidement pour que TikTok ne renvoie pas le message
    res.status(200).send('EVENT_RECEIVED');

  } catch (error) {
    console.error("❌ Erreur Webhook :", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
};