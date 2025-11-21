import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export const checkText = async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ message: 'Aucun texte fourni' });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "Tu es Vera, un assistant de vérification de faits. Analyse les affirmations soumises et fournis une vérification factuelle basée sur tes connaissances. Indique si l'affirmation semble vraie, fausse, ou nécessite plus de contexte. Sois clair, concis et pédagogique."
        },
        {
          role: "user",
          content: text
        }
      ],
      max_tokens: 1000
    });

    const analysis = response.choices[0].message.content;

    res.json({
      success: true,
      analysis,
      type: 'text'
    });
  } catch (error) {
    console.error('Erreur lors de la vérification du texte:', error);
    res.status(500).json({ message: 'Erreur lors de la vérification' });
  }
};

export const checkImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Aucune image fournie' });
    }

    const imagePath = req.file.path;
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "Tu es Vera, un assistant de vérification de faits. Analyse l'image soumise, extrait les informations textuelles et visuelles, et fournis une vérification factuelle de son contenu. Détecte les potentielles manipulations ou désinformations."
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyse cette image et vérifie les faits qu'elle contient. Extrait le texte visible et vérifie son exactitude."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${req.file.mimetype};base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 1500
    });

    const analysis = response.choices[0].message.content;

    fs.unlinkSync(imagePath);

    res.json({
      success: true,
      analysis,
      type: 'image'
    });
  } catch (error) {
    console.error('Erreur lors de l\'analyse de l\'image:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ message: 'Erreur lors de l\'analyse de l\'image' });
  }
};

export const checkVideo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Aucune vidéo fournie' });
    }

    const videoPath = req.file.path;
    const audioPath = path.join(path.dirname(videoPath), `audio-${Date.now()}.mp3`);

    const ffmpeg = (await import('fluent-ffmpeg')).default;

    await new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .output(audioPath)
        .audioCodec('libmp3lame')
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    const audioTranscription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: "whisper-1",
      language: "fr"
    });

    const analysisResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "Tu es Vera, un assistant de vérification de faits. Analyse la transcription audio d'une vidéo et fournis une vérification factuelle de son contenu. Détecte les potentielles désinformations ou manipulations."
        },
        {
          role: "user",
          content: `Voici la transcription d'une vidéo : "${audioTranscription.text}"\n\nAnalyse et vérifie les faits mentionnés.`
        }
      ],
      max_tokens: 1500
    });

    const analysis = analysisResponse.choices[0].message.content;

    fs.unlinkSync(videoPath);
    fs.unlinkSync(audioPath);

    res.json({
      success: true,
      transcription: audioTranscription.text,
      analysis,
      type: 'video'
    });
  } catch (error) {
    console.error('Erreur lors de l\'analyse de la vidéo:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ message: 'Erreur lors de l\'analyse de la vidéo' });
  }
};
