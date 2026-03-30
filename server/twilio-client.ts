import twilio from 'twilio';

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X-Replit-Token not found');
  }

  const data = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=twilio',
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken
      }
    }
  ).then(res => res.json()).then(d => d.items?.[0]);

  if (!data?.settings?.account_sid) {
    throw new Error('Twilio not connected');
  }
  return {
    accountSid: data.settings.account_sid as string,
    apiKey: data.settings.api_key as string,
    apiKeySecret: data.settings.api_key_secret as string,
    phoneNumber: (data.settings.phone_number as string) || null,
  };
}

export async function getTwilioClient() {
  const { accountSid, apiKey, apiKeySecret } = await getCredentials();
  return twilio(apiKey, apiKeySecret, { accountSid });
}

export async function getTwilioFromNumber() {
  const { phoneNumber } = await getCredentials();
  return phoneNumber;
}

/**
 * Send a WhatsApp message to a supervisor phone number.
 * toPhone must be in E.164 format, e.g. "+5521999999999"
 */
export async function sendWhatsAppMessage(toPhone: string, message: string): Promise<boolean> {
  try {
    console.log('[WhatsApp] Getting Twilio credentials...');
    const client = await getTwilioClient();
    const from = await getTwilioFromNumber();
    const fromWA = from ? `whatsapp:${from}` : 'whatsapp:+14155238886'; // Twilio sandbox fallback
    console.log(`[WhatsApp] Sending from ${fromWA} to whatsapp:${toPhone}`);
    const msg = await client.messages.create({
      from: fromWA,
      to: `whatsapp:${toPhone}`,
      body: message,
    });
    console.log(`[WhatsApp] Message sent successfully. SID: ${msg.sid}, Status: ${msg.status}`);
    return true;
  } catch (err: any) {
    console.error('[WhatsApp] Failed to send message:', err?.message || err);
    if (err?.code) console.error('[WhatsApp] Twilio error code:', err.code, err.moreInfo);
    return false;
  }
}
