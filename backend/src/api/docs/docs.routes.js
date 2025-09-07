import express from 'express';
import * as docsController from './docs.controller.js';
import authenticate from '../../middleware/auth.js';

const router = express.Router();

// All Docs routes require authentication
router.use(authenticate);

router.post('/', docsController.createDocument);
router.get('/:documentId', docsController.getDocumentContent);
router.post('/:documentId/batchUpdate', docsController.batchUpdateDocument);
router.post('/:documentId/addShort', docsController.addShortToDocument);
router.get('/:documentId/shorts/:shortId', docsController.getShortContentFromDoc);
router.put('/:documentId/shorts/:shortId', docsController.updateShortContentInDoc);
router.delete('/:documentId/shorts/:shortId', docsController.deleteShortFromDocument);
router.get('/:documentId/allShorts', docsController.getAllShortsFromDocument);

export default router;
