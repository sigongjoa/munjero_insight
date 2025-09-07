import express from 'express';
import * as sheetsController from './sheets.controller.js';
import authenticate from '../../middleware/auth.js';

const router = express.Router();

// All Sheets routes require authentication
router.use(authenticate);

router.post('/', sheetsController.createSpreadsheet);
router.get('/:spreadsheetId/values/:range', sheetsController.getSpreadsheetValues);
router.post('/:spreadsheetId/values/:range/append', sheetsController.appendSpreadsheetValues);
router.put('/:spreadsheetId/values/:range', sheetsController.updateSpreadsheetValues);
router.post('/:spreadsheetId/values/:range/clear', sheetsController.clearSpreadsheetValues);

export default router;
