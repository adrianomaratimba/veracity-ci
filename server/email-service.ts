// Email service with SendGrid as primary provider
// Fallback to Resend if SendGrid is not configured

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

async function sendWithSendGrid(options: EmailOptions): Promise<boolean> {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    console.log('[Email] SendGrid API key not found');
    return false;
  }

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: options.to }] }],
        from: { email: 'noreply@dataveracity.com.br', name: 'Veracity' },
        subject: options.subject,
        content: [{ type: 'text/html', value: options.html }],
      }),
    });

    if (response.status === 202) {
      console.log(`[Email] SendGrid: Email sent successfully to ${options.to}`);
      return true;
    } else {
      const errorText = await response.text();
      console.error(`[Email] SendGrid error: ${response.status} - ${errorText}`);
      return false;
    }
  } catch (error) {
    console.error('[Email] SendGrid exception:', error);
    return false;
  }
}

async function sendWithResend(options: EmailOptions): Promise<boolean> {
  try {
    const { Resend } = await import('resend');
    
    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    const xReplitToken = process.env.REPL_IDENTITY 
      ? 'repl ' + process.env.REPL_IDENTITY 
      : process.env.WEB_REPL_RENEWAL 
        ? 'depl ' + process.env.WEB_REPL_RENEWAL 
        : null;

    if (!xReplitToken || !hostname) {
      console.log('[Email] Resend: Token or hostname not available');
      return false;
    }

    const connectionSettings = await fetch(
      'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
      {
        headers: {
          'Accept': 'application/json',
          'X_REPLIT_TOKEN': xReplitToken
        }
      }
    ).then(res => res.json()).then(data => data.items?.[0]);

    if (!connectionSettings?.settings?.api_key) {
      console.log('[Email] Resend: Not connected');
      return false;
    }

    const client = new Resend(connectionSettings.settings.api_key);
    const fromEmail = 'Veracity <onboarding@resend.dev>';

    const { error } = await client.emails.send({
      from: fromEmail,
      to: [options.to],
      subject: options.subject,
      html: options.html,
    });

    if (error) {
      console.error('[Email] Resend error:', error);
      return false;
    }

    console.log(`[Email] Resend: Email sent successfully to ${options.to}`);
    return true;
  } catch (error) {
    console.error('[Email] Resend exception:', error);
    return false;
  }
}

async function sendEmail(options: EmailOptions): Promise<boolean> {
  // Try SendGrid first (primary)
  const sendGridResult = await sendWithSendGrid(options);
  if (sendGridResult) return true;

  // Fallback to Resend
  console.log('[Email] Falling back to Resend...');
  return await sendWithResend(options);
}

function getBaseUrl(): string {
  return process.env.REPLIT_DEV_DOMAIN 
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : process.env.REPLIT_DEPLOYMENT_URL 
      ? `https://${process.env.REPLIT_DEPLOYMENT_URL}`
      : 'https://dataveracity.com.br';
}

function buildEmailTemplate(content: { title: string; greeting: string; body: string; buttonText: string; buttonUrl: string; footer: string }): string {
  return `
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
        <h2 style="margin-top: 0; color: #1e3a5f;">${content.title}</h2>
        <p>${content.greeting}</p>
        ${content.body}
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${content.buttonUrl}" style="background: #1e3a5f; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">${content.buttonText}</a>
        </div>
        
        <p style="font-size: 14px; color: #666;">Se o botao nao funcionar, copie e cole este link no seu navegador:</p>
        <p style="font-size: 12px; color: #888; word-break: break-all;">${content.buttonUrl}</p>
      </div>
      
      <div style="text-align: center; font-size: 12px; color: #888;">
        ${content.footer}
        <p style="margin-top: 20px;">&copy; ${new Date().getFullYear()} Veracity. Todos os direitos reservados.</p>
      </div>
    </body>
    </html>
  `;
}

export async function sendPasswordResetEmail(to: string, resetToken: string, userName?: string): Promise<boolean> {
  const baseUrl = getBaseUrl();
  const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;
  const greeting = userName ? `Ola ${userName},` : 'Ola,';

  const html = buildEmailTemplate({
    title: 'Redefinicao de Senha',
    greeting,
    body: `
      <p>Recebemos uma solicitacao para redefinir a senha da sua conta no Veracity.</p>
      <p>Clique no botao abaixo para criar uma nova senha:</p>
    `,
    buttonText: 'Redefinir Senha',
    buttonUrl: resetLink,
    footer: `
      <p>Este link expira em 24 horas.</p>
      <p>Se voce nao solicitou esta redefinicao, ignore este email.</p>
    `,
  });

  const result = await sendEmail({
    to,
    subject: 'Redefinicao de Senha - Veracity',
    html,
  });

  if (result) {
    console.log(`[Email] Password reset email sent to ${to}`);
  } else {
    console.error(`[Email] Failed to send password reset email to ${to}`);
  }

  return result;
}

export async function sendWelcomeEmail(to: string, setupToken: string, userName?: string, organizationName?: string): Promise<boolean> {
  const baseUrl = getBaseUrl();
  const setupLink = `${baseUrl}/reset-password?token=${setupToken}`;
  const greeting = userName ? `Ola ${userName},` : 'Ola,';
  const orgText = organizationName ? ` da organizacao <strong>${organizationName}</strong>` : '';

  const html = buildEmailTemplate({
    title: 'Bem-vindo ao Veracity!',
    greeting,
    body: `
      <p>Voce foi adicionado a equipe${orgText} no Veracity, a plataforma de pesquisas eleitorais.</p>
      <p>Para comecar a usar o sistema, configure sua senha clicando no botao abaixo:</p>
    `,
    buttonText: 'Configurar Minha Senha',
    buttonUrl: setupLink,
    footer: '<p>Este link expira em 24 horas.</p>',
  });

  const result = await sendEmail({
    to,
    subject: 'Bem-vindo ao Veracity - Configure sua conta',
    html,
  });

  if (result) {
    console.log(`[Email] Welcome email sent to ${to}`);
  } else {
    console.error(`[Email] Failed to send welcome email to ${to}`);
  }

  return result;
}

// Test function to verify email configuration
export async function testEmailConfiguration(): Promise<{ provider: string; success: boolean; error?: string }> {
  const sendGridKey = process.env.SENDGRID_API_KEY;
  
  if (sendGridKey) {
    return { provider: 'SendGrid', success: true };
  }
  
  return { provider: 'none', success: false, error: 'No email provider configured' };
}
