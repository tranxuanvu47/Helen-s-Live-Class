import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { StreamChat } from 'stream-chat';
import { v4 as uuidv4 } from 'uuid';

import { config } from '../config';

const router = Router();
const serverClient = StreamChat.getInstance(
  config.stream.apiKey,
  config.stream.apiSecret,
);

interface TokenRequest {
  userId: string;
  userName: string;
  userImage?: string;
}

// POST /api/auth/token  –  obtain a Stream user token
router.post(
  '/token',
  [
    body('userId').isString().notEmpty().trim(),
    body('userName').isString().notEmpty().trim(),
    body('userImage').optional().isURL(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res
        .status(400)
        .json({ error: { message: 'Validation failed', details: errors.array() } });
    }

    try {
      const { userId, userName, userImage } = req.body as TokenRequest;

      await serverClient.upsertUser({
        id: userId,
        name: userName,
        image: userImage,
        role: 'user',
      });

      // Token valid for 24 h
      const expiresAt = Math.floor(Date.now() / 1000) + 86_400;
      const token = serverClient.createToken(userId, expiresAt);

      return res.json({
        token,
        userId,
        userName,
        userImage: userImage ?? null,
        apiKey: config.stream.apiKey,
      });
    } catch (err) {
      return next(err);
    }
  },
);

// POST /api/auth/guest  –  create an anonymous guest user
router.post('/guest', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const suffix = uuidv4().replace(/-/g, '').slice(0, 8);
    const userId = `guest_${suffix}`;
    const userName = `Guest ${suffix.slice(0, 4).toUpperCase()}`;

    await serverClient.upsertUser({ id: userId, name: userName, role: 'user' });

    const expiresAt = Math.floor(Date.now() / 1000) + 86_400;
    const token = serverClient.createToken(userId, expiresAt);

    return res.json({ token, userId, userName, apiKey: config.stream.apiKey });
  } catch (err) {
    return next(err);
  }
});

export { router as authRouter };
