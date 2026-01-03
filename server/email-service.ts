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
  const credentials = await getCredentials();
  return {
    client: new Resend(credentials.apiKey),
    fromEmail: credentials.fromEmail
  };
}

interface InvitationEmailData {
  to: string;
  inviterName: string;
  organizationName: string;
  role: string;
  appUrl: string;
}

export async function sendInvitationEmail(data: InvitationEmailData): Promise<void> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    
    const roleLabels: Record<string, string> = {
      admin: 'Administrador',
      coordinator: 'Coordenador',
      interviewer: 'Entrevistador',
      viewer: 'Visualizador'
    };
    
    const roleLabel = roleLabels[data.role] || data.role;
    
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Convite para VotoAudit</title>
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">VotoAudit</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Plataforma de Pesquisas Eleitorais</p>
  </div>
  
  <div style="background: white; padding: 40px 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
    <h2 style="color: #1e3a5f; margin-top: 0;">Você foi convidado!</h2>
    
    <p><strong>${data.inviterName}</strong> convidou você para participar da organização <strong>${data.organizationName}</strong> no VotoAudit.</p>
    
    <div style="background: #f8fafc; border-left: 4px solid #2563eb; padding: 15px 20px; margin: 25px 0; border-radius: 0 8px 8px 0;">
      <p style="margin: 0; color: #64748b; font-size: 14px;">Sua função na equipe:</p>
      <p style="margin: 5px 0 0 0; font-size: 18px; font-weight: 600; color: #1e3a5f;">${roleLabel}</p>
    </div>
    
    <p>Para aceitar o convite e acessar a plataforma, clique no botão abaixo:</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${data.appUrl}" style="display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; padding: 14px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);">
        Acessar VotoAudit
      </a>
    </div>
    
    <p style="color: #64748b; font-size: 14px;">Se o botão não funcionar, copie e cole este link no seu navegador:</p>
    <p style="color: #2563eb; font-size: 14px; word-break: break-all;">${data.appUrl}</p>
    
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
    
    <p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">
      Este email foi enviado automaticamente pelo VotoAudit. Se você não esperava este convite, pode ignorar esta mensagem.
    </p>
  </div>
</body>
</html>
    `;
    
    await client.emails.send({
      from: fromEmail || 'VotoAudit <noreply@resend.dev>',
      to: data.to,
      subject: `${data.inviterName} convidou você para ${data.organizationName} - VotoAudit`,
      html: htmlContent
    });
    
    console.log(`[email] Invitation email sent to ${data.to}`);
  } catch (error) {
    console.error('[email] Failed to send invitation email:', error);
    throw error;
  }
}

interface WelcomeEmailData {
  to: string;
  userName: string;
  organizationName: string;
  appUrl: string;
}

export async function sendWelcomeEmail(data: WelcomeEmailData): Promise<void> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bem-vindo ao VotoAudit</title>
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">VotoAudit</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Plataforma de Pesquisas Eleitorais</p>
  </div>
  
  <div style="background: white; padding: 40px 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
    <h2 style="color: #1e3a5f; margin-top: 0;">Bem-vindo, ${data.userName}!</h2>
    
    <p>Você agora faz parte da equipe <strong>${data.organizationName}</strong> no VotoAudit.</p>
    
    <p>Com o VotoAudit você pode:</p>
    <ul style="color: #475569;">
      <li>Participar de pesquisas eleitorais</li>
      <li>Coletar dados em campo com GPS e gravação de áudio</li>
      <li>Acompanhar o progresso das pesquisas em tempo real</li>
    </ul>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${data.appUrl}" style="display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; padding: 14px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);">
        Acessar VotoAudit
      </a>
    </div>
    
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
    
    <p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">
      Este email foi enviado automaticamente pelo VotoAudit.
    </p>
  </div>
</body>
</html>
    `;
    
    await client.emails.send({
      from: fromEmail || 'VotoAudit <noreply@resend.dev>',
      to: data.to,
      subject: `Bem-vindo ao ${data.organizationName} - VotoAudit`,
      html: htmlContent
    });
    
    console.log(`[email] Welcome email sent to ${data.to}`);
  } catch (error) {
    console.error('[email] Failed to send welcome email:', error);
    throw error;
  }
}
