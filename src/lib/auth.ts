import jwt from 'jsonwebtoken';

export type AuthToken = {
  userId: string;
  studioId: string;
  role: string;
  permissions?: string[];
};

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET is not set. Tokens cannot be verified.');
}

export function signToken(payload: AuthToken, expiresIn = '7d'): string {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET not configured');
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

export function verifyToken(token: string): AuthToken | null {
  if (!JWT_SECRET) return null;
  try {
    return jwt.verify(token, JWT_SECRET) as AuthToken;
  } catch (_err) {
    return null;
  }
}
