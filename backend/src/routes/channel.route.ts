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

interface CreateChannelBody {
  name: string;
  createdById: string;
  members?: string[];
  description?: string;
}

// POST /api/channels  –  create a new messaging channel
router.post(
  '/',
  [
    body('name').isString().notEmpty().trim(),
    body('createdById').isString().notEmpty().trim(),
    body('members').optional().isArray(),
    body('description').optional().isString().trim(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res
        .status(400)
        .json({ error: { message: 'Validation failed', details: errors.array() } });
    }

    try {
      const {
        name,
        createdById,
        members = [],
        description = '',
      } = req.body as CreateChannelBody;

      const channelId = uuidv4().replace(/-/g, '').slice(0, 24);
      const allMembers = [...new Set([createdById, ...members])];

      const channel = serverClient.channel('messaging', channelId, {
        name,
        description,
        created_by_id: createdById,
        members: allMembers,
      });

      await channel.create();

      return res.status(201).json({
        channelId,
        channelType: 'messaging',
        name,
        description,
        createdById,
        members: allMembers,
      });
    } catch (err) {
      return next(err);
    }
  },
);

export { router as channelRouter };
