import multer from "multer";
import { spawn } from "child_process";

// On stocke en RAM (Mémoire) pour être rapide et ne pas encombrer le disque
const upload = multer({ storage: multer.memoryStorage() });

/**
 * Middleware pour extraire frames et audio depuis un buffer vidéo
 * C'est lui qui fait le travail difficile AVANT le contrôleur
 */
export const videoProcessingMiddleware = async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ message: "Aucune vidéo fournie" });
  }

  const videoBuffer = req.file.buffer;

  try {
    console.log("🎬 Début du traitement vidéo...");

    // 1. Extraction des images (1 par seconde)
    const frames = await extractFramesFromBuffer(videoBuffer, 1); 
    req.frames = frames.map(f => f.toString("base64")); // On attache ça à la requête

    // 2. Extraction de l'audio
    const audio = await extractAudioFromBuffer(videoBuffer);
    req.audio = audio.toString("base64"); // On attache ça aussi

    console.log(`✅ Traitement fini : ${frames.length} frames extraites.`);
    next(); // On passe au contrôleur
  } catch (err) {
    console.error("❌ Erreur processing vidéo:", err);
    res.status(500).json({ message: "Erreur technique lors du traitement de la vidéo" });
  }
};

/**
 * Helper : Extrait des frames JPEG depuis un buffer vidéo
 */
const extractFramesFromBuffer = (videoBuffer, fps = 1) => {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-i", "pipe:0",        // Entrée : Pipe (le buffer)
      "-vf", `fps=${fps}`,   // Filtre : Frames par seconde
      "-f", "image2pipe",    // Format de sortie : Flux d'images
      "-vcodec", "mjpeg",    // Codec : JPEG
      "pipe:1"               // Sortie : Pipe
    ]);

    ffmpeg.stdin.write(videoBuffer);
    ffmpeg.stdin.end();

    const frames = [];
    let buffer = Buffer.alloc(0);

    ffmpeg.stdout.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      let start = buffer.indexOf(Buffer.from([0xff, 0xd8])); // Début JPEG
      let end = buffer.indexOf(Buffer.from([0xff, 0xd9]));   // Fin JPEG

      while (start !== -1 && end !== -1 && end > start) {
        const frame = buffer.slice(start, end + 2);
        frames.push(frame);
        buffer = buffer.slice(end + 2);
        start = buffer.indexOf(Buffer.from([0xff, 0xd8]));
        end = buffer.indexOf(Buffer.from([0xff, 0xd9]));
      }
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) resolve(frames);
      else reject(new Error(`FFmpeg a planté avec le code ${code}`));
    });
    
    ffmpeg.on("error", (err) => {
        reject(new Error("FFmpeg n'est pas installé ou introuvable."));
    });
  });
};

/**
 * Helper : Extrait l'audio WAV depuis un buffer vidéo
 */
const extractAudioFromBuffer = (videoBuffer) => {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-i", "pipe:0",
      "-vn",               // Pas de vidéo
      "-f", "wav",         // Format WAV
      "-ar", "16000",      // Qualité audio (16kHz suffisant pour Whisper)
      "pipe:1"
    ]);

    ffmpeg.stdin.write(videoBuffer);
    ffmpeg.stdin.end();

    const chunks = [];
    ffmpeg.stdout.on("data", chunk => chunks.push(chunk));

    ffmpeg.on("close", code => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`FFmpeg audio error code ${code}`));
    });
  });
};

// Export combiné pour les routes : Upload + Traitement
export const uploadAndProcessVideo = [upload.single("video"), videoProcessingMiddleware];

export default upload;