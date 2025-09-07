import { Router } from 'express';
import { analyzeChannel } from './channel.controller.js';

const router = Router();

router.post('/analyze', analyzeChannel);

export default router;
