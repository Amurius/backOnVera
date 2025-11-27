import multer from "multer";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const upload = multer({ storage: multer.memoryStorage() });

/**
 * Middleware pour extraire frames et audio depuis un buffer vidéo
 */
export const videoProcessingMiddleware = async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ message: "Aucune vidéo fournie" });
  }

  const videoBuffer = req.file.buffer;
  const tempVideoPath = path.join(os.tmpdir(), `video-${Date.now()}.mp4`);

  try {
    // Ecrire le buffer dans un fichier temporaire
    fs.writeFileSync(tempVideoPath, videoBuffer);

    // Extraction frames
    const frames = await extractFramesFromFile(tempVideoPath, 1);
    req.frames = frames.map(f => f.toString("base64"));

    // Extraction audio
    const audio = await extractAudioFromFile(tempVideoPath);
    req.audio = audio.toString("base64");

    // Supprimer le fichier temporaire
    fs.unlinkSync(tempVideoPath);

    next();
  } catch (err) {
    // Nettoyer en cas d'erreur
    if (fs.existsSync(tempVideoPath)) {
      fs.unlinkSync(tempVideoPath);
    }
    console.error("Erreur processing vidéo:", err);
    res.status(500).json({ message: "Erreur lors du traitement de la vidéo" });
  }
};

/**
 * Extrait des frames JPEG depuis un fichier vidéo
 */
const extractFramesFromFile = (videoPath, fps = 1) => {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-i", videoPath,
      "-vf", `fps=${fps}`,
      "-f", "image2pipe",
      "-vcodec", "mjpeg",
      "pipe:1"
    ]);

    const frames = [];
    let buffer = Buffer.alloc(0);

    ffmpeg.stdout.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      let start = buffer.indexOf(Buffer.from([0xff, 0xd8])); // SOI
      let end = buffer.indexOf(Buffer.from([0xff, 0xd9]));   // EOI

      while (start !== -1 && end !== -1 && end > start) {
        const frame = buffer.slice(start, end + 2);
        frames.push(frame);
        buffer = buffer.slice(end + 2);
        start = buffer.indexOf(Buffer.from([0xff, 0xd8]));
        end = buffer.indexOf(Buffer.from([0xff, 0xd9]));
      }
    });

    ffmpeg.stderr.on("data", () => {}); // Ignorer stderr

    ffmpeg.on("close", (code) => {
      if (code === 0) resolve(frames);
      else reject(new Error(`FFmpeg frames exited with code ${code}`));
    });
  });
};

/**
 * Extrait l'audio WAV depuis un fichier vidéo
 */
const extractAudioFromFile = (videoPath) => {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-i", videoPath,
      "-vn",
      "-f", "wav",
      "-ar", "16000",
      "pipe:1"
    ]);

    const chunks = [];
    ffmpeg.stdout.on("data", chunk => chunks.push(chunk));
    ffmpeg.stderr.on("data", () => {}); // Ignorer stderr

    ffmpeg.on("close", code => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`FFmpeg audio exited with code ${code}`));
    });
  });
};

export const uploadAndProcessVideo = [upload.single("video"), videoProcessingMiddleware];
export default upload;
