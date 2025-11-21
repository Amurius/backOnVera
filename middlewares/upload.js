import multer from "multer";
import { spawn } from "child_process";

const upload = multer({ storage: multer.memoryStorage() });

/**
 * Middleware pour extraire frames et audio depuis un buffer vidéo
 */
export const videoProcessingMiddleware = async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ message: "Aucune vidéo fournie" });
  }

  const videoBuffer = req.file.buffer;

  try {
    // Extraction frames
    const frames = await extractFramesFromBuffer(videoBuffer, 1); // 1 frame/sec
    req.frames = frames.map(f => f.toString("base64"));

    // Extraction audio
    const audio = await extractAudioFromBuffer(videoBuffer);
    req.audio = audio.toString("base64");

    next();
  } catch (err) {
    console.error("Erreur processing vidéo:", err);
    res.status(500).json({ message: "Erreur lors du traitement de la vidéo" });
  }
};

/**
 * Extrait des frames JPEG depuis un buffer vidéo
 */
const extractFramesFromBuffer = (videoBuffer, fps = 1) => {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-i", "pipe:0",
      "-vf", `fps=${fps}`,
      "-f", "image2pipe",
      "-vcodec", "mjpeg",
      "pipe:1"
    ]);

    ffmpeg.stdin.write(videoBuffer);
    ffmpeg.stdin.end();

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

    ffmpeg.on("close", (code) => {
      if (code === 0) resolve(frames);
      else reject(new Error(`FFmpeg exited with code ${code}`));
    });
  });
};

/**
 * Extrait l'audio WAV depuis un buffer vidéo
 */
const extractAudioFromBuffer = (videoBuffer) => {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-i", "pipe:0",
      "-vn",               // pas de vidéo
      "-f", "wav",         // format WAV
      "-ar", "16000",      // sample rate 16kHz (optionnel)
      "pipe:1"
    ]);

    ffmpeg.stdin.write(videoBuffer);
    ffmpeg.stdin.end();

    const chunks = [];
    ffmpeg.stdout.on("data", chunk => chunks.push(chunk));

    ffmpeg.on("close", code => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`FFmpeg exited with code ${code}`));
    });
  });
};

export const uploadAndProcessVideo = [upload.single("video"), videoProcessingMiddleware];
export default upload;
