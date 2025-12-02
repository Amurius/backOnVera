import multer from "multer";

// On stocke en RAM (Mémoire) pour être rapide et ne pas encombrer le disque
const upload = multer({ storage: multer.memoryStorage() });

// Export pour les routes video : Upload simple sans traitement ffmpeg
export const uploadVideo = upload.single("video");

export default upload;