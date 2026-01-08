import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: { 
    message: 'Muitas tentativas de login. Aguarde 15 minutos antes de tentar novamente.',
    retryAfter: 15
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = req.body?.email?.toLowerCase() || '';
    return `${ipKeyGenerator(req.ip || '')}-${email}`;
  },
  skip: (req) => {
    return false;
  },
  handler: (req, res) => {
    res.status(429).json({
      message: 'Muitas tentativas de login. Aguarde 15 minutos antes de tentar novamente.',
      retryAfter: 15
    });
  }
});

export const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 password reset requests per hour
  message: { 
    message: 'Muitas solicitações de redefinição de senha. Aguarde 1 hora antes de tentar novamente.',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = req.body?.email?.toLowerCase() || '';
    return `${ipKeyGenerator(req.ip || '')}-${email}`;
  },
  handler: (req, res) => {
    res.status(429).json({
      message: 'Muitas solicitações de redefinição de senha. Aguarde 1 hora antes de tentar novamente.',
      retryAfter: 60
    });
  }
});

export const registrationRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 registration attempts per hour per IP
  message: { 
    message: 'Muitas tentativas de registro. Aguarde 1 hora antes de tentar novamente.',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      message: 'Muitas tentativas de registro. Aguarde 1 hora antes de tentar novamente.',
      retryAfter: 60
    });
  }
});

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: { 
    message: 'Muitas requisições. Aguarde um momento antes de tentar novamente.',
    retryAfter: 1
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return req.path.startsWith('/assets') || req.path.startsWith('/static');
  }
});
