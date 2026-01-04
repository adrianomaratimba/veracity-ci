// Email service using Resend integration
import { Resend } from 'resend';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key)) {
    throw new Error('Resend not connected');
  }
  return { apiKey: connectionSettings.settings.api_key, fromEmail: connectionSettings.settings.from_email };
}

async function getUncachableResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  // Always use Resend's test domain for now since custom domains need verification
  // onboarding@resend.dev is Resend's sandbox email that works without domain verification
  // Once you verify a custom domain in Resend, you can update the from_email in the connector settings
  const effectiveFromEmail = 'Veracity <onboarding@resend.dev>';
  console.log('[Email] Using from email:', effectiveFromEmail);
  return {
    client: new Resend(apiKey),
    fromEmail: effectiveFromEmail
  };
}

export async function sendPasswordResetEmail(to: string, resetToken: string, userName?: string): Promise<boolean> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    
    // Get the base URL from environment or use default
    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : process.env.REPLIT_DEPLOYMENT_URL 
        ? `https://${process.env.REPLIT_DEPLOYMENT_URL}`
        : 'https://veracity.app';
    
    const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;
    const greeting = userName ? `Olá ${userName},` : 'Olá,';

    const { error } = await client.emails.send({
      from: fromEmail,
      to: [to],
      subject: 'Redefinição de Senha - Veracity',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="display: inline-flex; align-items: center; gap: 8px;">
              <div style="background: #1e3a5f; color: white; width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 20px;">V</div>
              <span style="font-size: 24px; font-weight: bold; color: #1e3a5f;">Veracity</span>
            </div>
          </div>
          
          <div style="background: #f8fafc; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
            <h2 style="margin-top: 0; color: #1e3a5f;">Redefinição de Senha</h2>
            <p>${greeting}</p>
            <p>Recebemos uma solicitação para redefinir a senha da sua conta no Veracity.</p>
            <p>Clique no botão abaixo para criar uma nova senha:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}" style="background: #1e3a5f; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">Redefinir Senha</a>
            </div>
            
            <p style="font-size: 14px; color: #666;">Se o botão não funcionar, copie e cole este link no seu navegador:</p>
            <p style="font-size: 12px; color: #888; word-break: break-all;">${resetLink}</p>
          </div>
          
          <div style="text-align: center; font-size: 12px; color: #888;">
            <p>Este link expira em 24 horas.</p>
            <p>Se você não solicitou esta redefinição, ignore este email.</p>
            <p style="margin-top: 20px;">&copy; ${new Date().getFullYear()} Veracity. Todos os direitos reservados.</p>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error('Error sending password reset email:', error);
      return false;
    }

    console.log(`Password reset email sent to ${to}`);
    return true;
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    return false;
  }
}

export async function sendWelcomeEmail(to: string, setupToken: string, userName?: string, organizationName?: string): Promise<boolean> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    
    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : process.env.REPLIT_DEPLOYMENT_URL 
        ? `https://${process.env.REPLIT_DEPLOYMENT_URL}`
        : 'https://veracity.app';
    
    const setupLink = `${baseUrl}/reset-password?token=${setupToken}`;
    const greeting = userName ? `Olá ${userName},` : 'Olá,';
    const orgText = organizationName ? ` da organização <strong>${organizationName}</strong>` : '';

    const { error } = await client.emails.send({
      from: fromEmail,
      to: [to],
      subject: 'Bem-vindo ao Veracity - Configure sua conta',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="display: inline-flex; align-items: center; gap: 8px;">
              <div style="background: #1e3a5f; color: white; width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 20px;">V</div>
              <span style="font-size: 24px; font-weight: bold; color: #1e3a5f;">Veracity</span>
            </div>
          </div>
          
          <div style="background: #f8fafc; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
            <h2 style="margin-top: 0; color: #1e3a5f;">Bem-vindo ao Veracity!</h2>
            <p>${greeting}</p>
            <p>Você foi adicionado à equipe${orgText} no Veracity, a plataforma de pesquisas eleitorais.</p>
            <p>Para começar a usar o sistema, configure sua senha clicando no botão abaixo:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${setupLink}" style="background: #1e3a5f; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">Configurar Minha Senha</a>
            </div>
            
            <p style="font-size: 14px; color: #666;">Se o botão não funcionar, copie e cole este link no seu navegador:</p>
            <p style="font-size: 12px; color: #888; word-break: break-all;">${setupLink}</p>
          </div>
          
          <div style="text-align: center; font-size: 12px; color: #888;">
            <p>Este link expira em 24 horas.</p>
            <p style="margin-top: 20px;">&copy; ${new Date().getFullYear()} Veracity. Todos os direitos reservados.</p>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error('Error sending welcome email:', error);
      return false;
    }

    console.log(`Welcome email sent to ${to}`);
    return true;
  } catch (error) {
    console.error('Failed to send welcome email:', error);
    return false;
  }
}
