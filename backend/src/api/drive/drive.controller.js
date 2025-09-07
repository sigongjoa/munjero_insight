import { google } from 'googleapis';
import { getTokensForUser } from '../auth/auth.controller.js';
import multer from 'multer';
import stream from 'stream';
import { getGoogleClient } from '../../utils/googleClientUtils.js';

// Configure Multer for file uploads
const upload = multer({ storage: multer.memoryStorage() });

export const uploadFile = [upload.single('file'), async (req, res) => {
  try {
    const userId = req.userId; // Assuming userId is attached by auth middleware
    if (!userId) {
      return res.status(401).send('Unauthorized: User ID not found.');
    }

    const drive = getGoogleClient(getTokensForUser(userId), 'drive', 'v3');
    const fileMetadata = { name: req.file.originalname };

    // Create a readable stream from the buffer
    const bufferStream = new stream.PassThrough();
    bufferStream.end(req.file.buffer);

    const media = {
      mimeType: req.file.mimetype,
      body: bufferStream,
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id,name,mimeType,webViewLink',
    });

    res.status(200).json(response.data);
  } catch (error) {
    console.error('Error uploading file:', error.message);
    res.status(500).send('Failed to upload file.');
  }
}];

export const listFiles = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).send('Unauthorized: User ID not found.');
    }

    const drive = getGoogleClient(getTokensForUser(userId), 'drive', 'v3');
    const q = req.query.q || ''; // Search query parameter
    const pageSize = req.query.pageSize || 10; // Number of files to return

    const response = await drive.files.list({
      pageSize: pageSize,
      fields: 'nextPageToken, files(id, name, mimeType, webViewLink, createdTime)',
      q: q, // Apply search query
    });

    res.status(200).json(response.data.files);
  } catch (error) {
    console.error('Error listing files:', error.message);
    res.status(500).send('Failed to list files.');
  }
};

export const downloadFile = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).send('Unauthorized: User ID not found.');
    }

    const drive = getGoogleClient(getTokensForUser(userId), 'drive', 'v3');
    const fileId = req.params.fileId;

    const response = await drive.files.get({
      fileId: fileId,
      alt: 'media',
    }, { responseType: 'stream' });

    response.data
      .on('end', () => {
        console.log('Done downloading file.');
      })
      .on('error', err => {
        console.error('Error during download', err);
        res.status(500).send('Failed to download file.');
      })
      .pipe(res);

  } catch (error) {
    console.error('Error downloading file:', error.message);
    res.status(500).send('Failed to download file.');
  }
};

export const deleteFile = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).send('Unauthorized: User ID not found.');
    }

    const drive = getGoogleClient(getTokensForUser(userId), 'drive', 'v3');
    const fileId = req.params.fileId;

    await drive.files.delete({ fileId: fileId });

    res.status(204).send(); // No Content
  } catch (error) {
    console.error('Error deleting file:', error.message);
    res.status(500).send('Failed to delete file.');
  }
};

// Helper to find an existing Google Doc by name and optional parent folder
const findGoogleDocByName = async (userId, fileName, parentFolderId = null) => {
  const drive = getGoogleClient(getTokensForUser(userId), 'drive', 'v3');
  let q = `name = '${fileName}' and mimeType = 'application/vnd.google-apps.document' and trashed = false`;
  if (parentFolderId) {
    q += ` and '${parentFolderId}' in parents`;
  }

  const response = await drive.files.list({
    q: q,
    fields: 'files(id, name, mimeType, webViewLink)',
    spaces: 'drive',
  });

  return response.data.files.length > 0 ? response.data.files[0] : null;
};

export const createGoogleDoc = async (userId, fileName, parentFolderId) => {
  try {
    const existingDoc = await findGoogleDocByName(userId, fileName, parentFolderId);
    if (existingDoc) {
      console.log(`Found existing Google Doc: ${existingDoc.name} (${existingDoc.id}). Reusing it.`);
      return existingDoc;
    }

    const drive = getGoogleClient(getTokensForUser(userId), 'drive', 'v3');
    const fileMetadata = {
      name: fileName,
      mimeType: 'application/vnd.google-apps.document',
      parents: [parentFolderId],
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      fields: 'id,name,mimeType,webViewLink',
    });

    return response.data;
  } catch (error) {
    console.error('Error creating Google Doc:', error.message);
    throw error; // Re-throw to be caught by the calling function
  }
};

export const createGoogleDocInRoot = async (userId, fileName) => {
  try {
    const existingDoc = await findGoogleDocByName(userId, fileName); // No parentFolderId for root
    if (existingDoc) {
      console.log(`Found existing Google Doc in root: ${existingDoc.name} (${existingDoc.id}). Reusing it.`);
      return existingDoc;
    }

    const drive = getGoogleClient(getTokensForUser(userId), 'drive', 'v3');
    const fileMetadata = {
      name: fileName,
      mimeType: 'application/vnd.google-apps.document',
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      fields: 'id,name,mimeType,webViewLink',
    });

    return response.data;
  } catch (error) {
    console.error('Error creating Google Doc in root:', error.message);
    throw error; // Re-throw to be caught by the calling function
  }
};

export const listGoogleDriveFolders = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).send('Unauthorized: User ID not found.');
    }

    const drive = getGoogleClient(getTokensForUser(userId), 'drive', 'v3');
    const response = await drive.files.list({
      q: 'mimeType = "application/vnd.google-apps.folder" and trashed = false',
      fields: 'nextPageToken, files(id, name, webViewLink)',
      pageSize: 100, // Adjust as needed
    });

    res.status(200).json(response.data.files);
  } catch (error) {
    console.error('Error listing Google Drive folders:', error.message);
    res.status(500).send('Failed to list Google Drive folders.');
  }
};
