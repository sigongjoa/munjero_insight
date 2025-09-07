import express from 'express';
import * as driveController from './drive.controller.js';
import authenticate from '../../middleware/auth.js';

const router = express.Router();

// All Drive routes require authentication
router.use(authenticate);

router.post('/upload', driveController.uploadFile);
router.get('/files', driveController.listFiles);
router.get('/files/:fileId/download', driveController.downloadFile);
router.delete('/files/:fileId', driveController.deleteFile);
router.get('/folders', driveController.listGoogleDriveFolders);

export default router;
