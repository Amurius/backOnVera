import nodemailer from 'nodemailer';

// Configuration du transporteur SMTP
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    tls: {
      rejectUnauthorized: false,
      checkServerIdentity: () => undefined
    }
  });
};

// Template HTML pour l'invitation moderateur
const getInvitationTemplate = (firstName, invitationLink) => {
  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitation VERA</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #FEF2E4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background-color: #1A1A1A; border-radius: 16px 16px 0 0;">
              <h1 style="margin: 0; color: #DBF9BE; font-size: 32px; font-weight: bold;">VERA</h1>
              <p style="margin: 10px 0 0; color: #ffffff; font-size: 14px;">Plateforme de sondages</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px; color: #1A1A1A; font-size: 24px;">
                Bonjour${firstName ? ` ${firstName}` : ''} !
              </h2>
              <p style="margin: 0 0 20px; color: #414651; font-size: 16px; line-height: 1.6;">
                Vous avez ete invite(e) a rejoindre l'equipe de moderation de <strong>VERA</strong>.
              </p>
              <p style="margin: 0 0 30px; color: #414651; font-size: 16px; line-height: 1.6;">
                Cliquez sur le bouton ci-dessous pour creer votre mot de passe et activer votre compte :
              </p>

              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center">
                    <a href="${invitationLink}"
                       style="display: inline-block; padding: 16px 32px; background-color: #1A1A1A; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                      Activer mon compte
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 30px 0 0; color: #717680; font-size: 14px; line-height: 1.6;">
                Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :
              </p>
              <p style="margin: 10px 0 0; color: #4B8BD4; font-size: 14px; word-break: break-all;">
                ${invitationLink}
              </p>

              <hr style="margin: 30px 0; border: none; border-top: 1px solid #E5E7EB;">

              <p style="margin: 0; color: #717680; font-size: 12px; line-height: 1.6;">
                Ce lien est valable pendant 7 jours. Si vous n'avez pas demande cette invitation, vous pouvez ignorer cet email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #F5ECDE; border-radius: 0 0 16px 16px; text-align: center;">
              <p style="margin: 0; color: #717680; font-size: 12px;">
                VERA - Votre plateforme de sondages intelligente
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

// Envoie l'email d'invitation
export const sendInvitationEmail = async (email, firstName, invitationToken) => {
  const transporter = createTransporter();

  // URL du frontend (production ou dev)
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
  const invitationLink = `${frontendUrl}/accept-invite?token=${invitationToken}`;

  const mailOptions = {
    from: `"VERA" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Invitation a rejoindre VERA',
    html: getInvitationTemplate(firstName, invitationLink)
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email envoye a ${email}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Erreur envoi email:', error);
    throw error;
  }
};

// Verifie la configuration SMTP
export const verifyEmailConfig = async () => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('Configuration SMTP manquante - les emails ne seront pas envoyes');
    return false;
  }

  try {
    const transporter = createTransporter();
    await transporter.verify();
    console.log('Configuration SMTP OK');
    return true;
  } catch (error) {
    console.error('Erreur configuration SMTP:', error);
    return false;
  }
};
