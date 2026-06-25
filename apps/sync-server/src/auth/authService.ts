import { query } from '../persistence/db';
import bcrypt from 'bcryptjs';
import { signToken, JwtPayload } from './jwt';

export interface User {
  id: number;
  email: string;
}

export class AuthService {
  async signup(email: string, password: string): Promise<User> {
    const existing = await query(`SELECT id FROM users WHERE email = $1`, [email]);
    if (existing.rows.length > 0) {
      throw new Error('Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await query(
      `INSERT INTO users (email, password_hash) 
       VALUES ($1, $2) 
       RETURNING id, email`,
      [email, passwordHash]
    );

    return result.rows[0];
  }

  async login(email: string, password: string): Promise<{ user: User; token: string }> {
    const result = await query(
      `SELECT id, email, password_hash FROM users WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid credentials');
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      throw new Error('Invalid credentials');
    }

    const token = signToken({ userId: user.id, email: user.email });

    return {
      user: { id: user.id, email: user.email },
      token,
    };
  }

  verifyToken(token: string): JwtPayload | null {
    return require('./jwt').verifyToken(token);
  }
}