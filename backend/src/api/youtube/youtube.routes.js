import express from 'express';
import * as youtubeController from './youtube.controller.js';
import authenticate from '../../middleware/auth.js';

const router = express.Router();

// All YouTube routes require authentication
router.use(authenticate);

router.get('/private-videos', youtubeController.listPrivateVideos);
router.post('/schedule-publish', youtubeController.schedulePublish);
router.post('/details', youtubeController.fetchVideoDetails);

export default router;