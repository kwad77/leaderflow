import { Router, Request, Response, NextFunction } from 'express';
import * as briefingService from '../services/briefing.service';
import * as orgService from '../services/org.service';
import { protect } from '../middleware/auth';

const router = Router();

/**
 * GET /api/briefing
 * Returns daily briefing: ingress, escalations, at-risk items
 */
router.get('/', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await orgService.getFirstOrg();
    const briefing = await briefingService.getDailyBriefing(org.id);
    res.json(briefing);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/briefing/weekly
 * Returns weekly stats summary
 */
router.get('/weekly', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await orgService.getFirstOrg();
    const weekly = await briefingService.getWeeklyBriefing(org.id);
    res.json(weekly);
  } catch (err) {
    next(err);
  }
});

export default router;
