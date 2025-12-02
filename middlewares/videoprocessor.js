import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================
// FONCTION D'EXTRACTION DES FRAMES ET AUDIO
// ==========================================
export const processVideoBuffer = async (req, videoBuffer) => {
  return new Promise((resolve, reject) => {
    const tempDir = path.join(__dirname, '../temp');
    const framesDir = path.join(tempDir, 'frames');
    const audioDir = path.join(tempDir, 'audio');
    
    // Créer les dossiers temporaires
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });
    if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });
    
    // Sauvegarder la vidéo temporairement
    const tempVideoPath = path.join(tempDir, `video_${Date.now()}.mp4`);
    fs.writeFileSync(tempVideoPath, videoBuffer);
    
    const frames = [];
    const framePattern = path.join(framesDir, `frame_${Date.now()}_%04d.jpg`);
    const audioPath = path.join(audioDir, `audio_${Date.now()}.mp3`);
    
    let audioExtracted = false;
    
    // Extraire l'audio en parallèle
    ffmpeg(tempVideoPath)
      .output(audioPath)
      .audioCodec('libmp3lame')
      .on('end', () => {
        audioExtracted = true;
        console.log('Audio extrait avec succès');
      })
      .on('error', (err) => {
        console.warn('Erreur extraction audio (peut-être pas d\'audio dans la vidéo):', err.message);
        audioExtracted = true; // On continue même sans audio
      })
      .run();
    
    // Extraire 10 frames de la vidéo
    ffmpeg(tempVideoPath)
      .outputOptions([
        '-vf fps=1/2', // 1 frame toutes les 2 secondes
        '-frames:v 10' // Maximum 10 frames
      ])
      .output(framePattern)
      .on('end', () => {
        // Attendre que l'audio soit aussi extrait
        const checkAudio = setInterval(() => {
          if (audioExtracted) {
            clearInterval(checkAudio);
            
            // Lire les frames générées
            const frameFiles = fs.readdirSync(framesDir)
              .filter(file => file.includes(`frame_${Date.now().toString().slice(0, -3)}`))
              .sort();
            
            frameFiles.forEach(file => {
              const framePath = path.join(framesDir, file);
              const frameBuffer = fs.readFileSync(framePath);
              frames.push(frameBuffer);
              fs.unlinkSync(framePath); // Nettoyer
            });
            
            // Lire l'audio si disponible
            let audioBuffer = null;
            if (fs.existsSync(audioPath)) {
              audioBuffer = fs.readFileSync(audioPath);
              fs.unlinkSync(audioPath); // Nettoyer
            }
            
            // Nettoyer le fichier vidéo temporaire
            fs.unlinkSync(tempVideoPath);
            
            // Attacher les frames et audio à req
            req.frames = frames;
            req.audio = audioBuffer;
            
            resolve({ frames, audio: audioBuffer });
          }
        }, 100);
      })
      .on('error', (err) => {
        console.error('Erreur extraction frames:', err);
        // Nettoyer en cas d'erreur
        if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
        reject(err);
      })
      .run();
  });
};

// ==========================================
// MIDDLEWARE EXPRESS
// ==========================================
export const videoProcessorMiddleware = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(422).json({ message: 'Aucune vidéo fournie' });
    }
    
    console.log('Traitement de la vidéo...');
    
    // Si la vidéo est dans un path (multer disk storage)
    if (req.file.path) {
      const videoBuffer = fs.readFileSync(req.file.path);
      await processVideoBuffer(req, videoBuffer);
    } 
    // Si la vidéo est dans un buffer (multer memory storage)
    else if (req.file.buffer) {
      await processVideoBuffer(req, req.file.buffer);
    } 
    else {
      return res.status(422).json({ message: 'Format de vidéo non supporté' });
    }
    
    console.log(`${req.frames.length} frames extraites`);
    next();
  } catch (error) {
    console.error('Erreur middleware videoProcessor:', error);
    res.status(500).json({ message: 'Erreur lors du traitement de la vidéo' });
  }
};

export default videoProcessorMiddleware;