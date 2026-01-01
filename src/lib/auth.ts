import jwt, { Secret, SignOptions } from 'jsonwebtoken';

export type AuthToken = {
  userId: string;
  studioId: string;
  role: string;
  permissions?: string[];
};

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required to start the API.');
}

export function signToken(payload: AuthToken, expiresIn: SignOptions['expiresIn'] = '7d'): string {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET not configured');
  }
  return jwt.sign(payload, JWT_SECRET as Secret, { expiresIn });
}

export function verifyToken(token: string): AuthToken | null {
  try {
    return jwt.verify(token, JWT_SECRET as Secret) as AuthToken;
  } catch (_err) {
    return null;
  }
}
