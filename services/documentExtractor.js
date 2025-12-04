/**
 * Service d'extraction de texte pour documents PDF, Word et LibreOffice
 * Extraction sans IA pour une meilleure fidélité au texte original
 */

import mammoth from 'mammoth';
import JSZip from 'jszip';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

// Types MIME supportés
export const SUPPORTED_DOCUMENT_TYPES = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
  'application/vnd.oasis.opendocument.text': 'odt',
  'text/plain': 'txt'
};

/**
 * Vérifie si le type MIME est un document supporté
 * @param {string} mimeType - Type MIME du fichier
 * @returns {boolean}
 */
export const isDocumentType = (mimeType) => {
  return Object.keys(SUPPORTED_DOCUMENT_TYPES).includes(mimeType);
};

/**
 * Extrait le texte d'un fichier PDF
 * @param {Buffer} buffer - Contenu du fichier
 * @returns {Promise<string>} - Texte extrait
 */
const extractFromPdf = async (buffer) => {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return result.text || '';
};

/**
 * Extrait le texte d'un fichier DOCX (Word 2007+)
 * @param {Buffer} buffer - Contenu du fichier
 * @returns {Promise<string>} - Texte extrait
 */
const extractFromDocx = async (buffer) => {
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
};

/**
 * Extrait le texte d'un fichier ODT (LibreOffice/OpenOffice)
 * ODT est un fichier ZIP contenant un fichier content.xml avec le texte
 * @param {Buffer} buffer - Contenu du fichier
 * @returns {Promise<string>} - Texte extrait
 */
const extractFromOdt = async (buffer) => {
  const zip = await JSZip.loadAsync(buffer);
  const contentXml = await zip.file('content.xml')?.async('string');

  if (!contentXml) {
    throw new Error('Fichier ODT invalide: content.xml non trouvé');
  }

  // Extraction du texte depuis le XML
  // Les balises <text:p> et <text:span> contiennent le texte
  let text = contentXml
    // Remplacer les balises de paragraphe par des sauts de ligne
    .replace(/<text:p[^>]*>/gi, '\n')
    .replace(/<\/text:p>/gi, '')
    // Remplacer les tabulations
    .replace(/<text:tab[^>]*\/>/gi, '\t')
    // Remplacer les espaces multiples
    .replace(/<text:s[^>]*\/>/gi, ' ')
    // Supprimer toutes les autres balises XML
    .replace(/<[^>]+>/g, '')
    // Décoder les entités HTML
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // Nettoyer les espaces multiples et sauts de ligne
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
};

/**
 * Extrait le texte d'un fichier DOC ancien format (Word 97-2003)
 * Note: Support basique - pour un support complet, utiliser antiword ou une lib spécialisée
 * @param {Buffer} buffer - Contenu du fichier
 * @returns {Promise<string>} - Texte extrait
 */
const extractFromDoc = async (buffer) => {
  // Essayer d'abord avec mammoth (qui supporte parfois les .doc)
  try {
    const result = await mammoth.extractRawText({ buffer });
    if (result.value && result.value.trim()) {
      return result.value;
    }
  } catch (e) {
    // Mammoth ne supporte pas ce fichier, continuer avec extraction basique
  }

  // Extraction basique du texte depuis le binaire
  // Les fichiers DOC contiennent du texte en ASCII/Unicode entre les métadonnées
  const text = buffer.toString('utf8');

  // Extraire les séquences de texte lisibles
  const cleanText = text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ')  // Caractères de contrôle
    .replace(/[^\x20-\x7E\xA0-\xFF\u0100-\uFFFF\n\r\t]/g, ' ')  // Non-imprimables
    .replace(/\s{3,}/g, '\n\n')  // Espaces multiples
    .trim();

  return cleanText;
};

/**
 * Extrait le texte d'un fichier texte brut
 * @param {Buffer} buffer - Contenu du fichier
 * @returns {Promise<string>} - Texte extrait
 */
const extractFromTxt = async (buffer) => {
  return buffer.toString('utf8').trim();
};

/**
 * Extrait le texte d'un document selon son type MIME
 * @param {Buffer} buffer - Contenu du fichier
 * @param {string} mimeType - Type MIME du fichier
 * @returns {Promise<{success: boolean, text?: string, error?: string}>}
 */
export const extractTextFromDocument = async (buffer, mimeType) => {
  try {
    const docType = SUPPORTED_DOCUMENT_TYPES[mimeType];

    if (!docType) {
      return {
        success: false,
        error: `Type de document non supporté: ${mimeType}`
      };
    }

    let text = '';

    switch (docType) {
      case 'pdf':
        text = await extractFromPdf(buffer);
        break;
      case 'docx':
        text = await extractFromDocx(buffer);
        break;
      case 'doc':
        text = await extractFromDoc(buffer);
        break;
      case 'odt':
        text = await extractFromOdt(buffer);
        break;
      case 'txt':
        text = await extractFromTxt(buffer);
        break;
      default:
        return {
          success: false,
          error: `Extracteur non implémenté pour: ${docType}`
        };
    }

    if (!text || !text.trim()) {
      return {
        success: false,
        error: 'Aucun texte extrait du document'
      };
    }

    return {
      success: true,
      text: text.trim()
    };

  } catch (error) {
    console.error('Erreur extraction document:', error);
    return {
      success: false,
      error: `Erreur lors de l'extraction: ${error.message}`
    };
  }
};

/**
 * Obtient l'extension de fichier à partir du type MIME
 * @param {string} mimeType - Type MIME
 * @returns {string|null}
 */
export const getExtensionFromMimeType = (mimeType) => {
  return SUPPORTED_DOCUMENT_TYPES[mimeType] || null;
};
