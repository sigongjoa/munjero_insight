import { Router } from 'express';
import { analyzeVideo, updateVideoAnalysis } from './video.controller.js';

const router = Router();

// Route to trigger the analysis of a specific video
router.post('/:videoId/analyze', analyzeVideo);

// Callback route for the Python service to post results
router.post('/:videoId/analysis-result', updateVideoAnalysis);

export default router;
