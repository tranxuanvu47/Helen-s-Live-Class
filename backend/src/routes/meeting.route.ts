import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

interface CreateMeetingBody {
  createdById: string;
  callId?: string;
  title?: string;
}

// POST /api/meetings  –  reserve a call-ID for a video meeting
// The actual call is created client-side via @stream-io/video-client
// (the same user JWT token works for both Chat and Video services)
router.post(
  '/',
  [
    body('createdById').isString().notEmpty().trim(),
    body('callId').optional().isString().trim(),
    body('title').optional().isString().trim(),
  ],
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res
        .status(400)
        .json({ error: { message: 'Validation failed', details: errors.array() } });
    }

    try {
      const { createdById, callId, title } = req.body as CreateMeetingBody;

      const meetingCallId = callId ?? uuidv4().replace(/-/g, '').slice(0, 20);

      return res.status(201).json({
        callId: meetingCallId,
        callType: 'default',
        title: title ?? `Meeting ${meetingCallId.slice(0, 6).toUpperCase()}`,
        createdById,
        joinUrl: `/meeting/${meetingCallId}`,
      });
    } catch (err) {
      return next(err);
    }
  },
);

// GET /api/meetings/:callId  –  get meeting info (lightweight, no server-side call state)
router.get('/:callId', (req: Request, res: Response) => {
  const { callId } = req.params;
  res.json({
    callId,
    callType: 'default',
    joinUrl: `/meeting/${callId}`,
  });
});

export { router as meetingRouter };
