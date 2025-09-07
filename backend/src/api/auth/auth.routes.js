import express from 'express';
import * as authController from './auth.controller.js';

const router = express.Router();

router.get('/google', authController.googleAuth);
router.get('/google/callback', authController.googleAuthCallback);

// A simple success page for redirect after authentication
router.get('/success', (req, res) => {
  res.send('Authentication successful! You can close this tab and return to the application.');
});

router.get('/status', authController.checkAuthStatus);
import authenticate from '../../middleware/auth.js'; // Import authenticate middleware
router.get('/me', authenticate, authController.getMe);

export default router;
