import { google } from 'googleapis';
import oauth2Client from '../../config/googleClient.js';
import { getTokensForUser } from '../auth/auth.controller.js';
import * as docHelpers from '../../services/docs/docHelpers.js';

// Helper to get a configured Docs API client for a user
const getDocsClient = (userId) => {
  const tokens = getTokensForUser(userId);
  if (!tokens) {
    throw new Error('User not authenticated.');
  }
  oauth2Client.setCredentials(tokens);
  return google.docs({ version: 'v1', auth: oauth2Client });
};

// Helper to get a configured Drive API client for a user
const getDriveClient = (userId) => {
  const tokens = getTokensForUser(userId);
  if (!tokens) {
    throw new Error('User not authenticated.');
  }
  oauth2Client.setCredentials(tokens);
  return google.drive({ version: 'v3', auth: oauth2Client });
};

export const createDocument = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).send('Unauthorized: User ID not found.');
    }

    const docs = getDocsClient(userId);
    const { title, folderId } = req.body; // Expect folderId

    if (!title) {
      return res.status(400).send('Document title is required.');
    }

    // 1. Create the document in root
    const createResponse = await docs.documents.create({
      requestBody: {
        title,
      },
    });

    const documentId = createResponse.data.documentId;

    // 2. If folderId is provided, move the document
    if (folderId) {
      const drive = getDriveClient(userId);
      const file = await drive.files.get({
        fileId: documentId,
        fields: 'parents',
      });
      await drive.files.update({
        fileId: documentId,
        addParents: folderId,
        removeParents: file.data.parents.join(','),
        fields: 'id, parents',
      });
    }

    // 3. Initialize the document with a template
    const templateRequests = docHelpers.initDocumentTemplate(title);
    if (templateRequests.length > 0) {
        await docs.documents.batchUpdate({
            documentId,
            requestBody: {
                requests: templateRequests,
            },
        });
    }

    res.status(200).json(createResponse.data);
  } catch (error) {
    console.error('Error creating document:', error.message);
    if (error.response && error.response.data && error.response.data.error) {
        console.error('Google API Error:', error.response.data.error);
        return res.status(500).send(`Google API Error: ${error.response.data.error.message}`);
    }
    res.status(500).send('Failed to create document.');
  }
};

export const getDocumentContent = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).send('Unauthorized: User ID not found.');
    }

    const docs = getDocsClient(userId);
    const { documentId } = req.params;

    if (!documentId) {
      return res.status(400).send('Document ID is required.');
    }

    const response = await docs.documents.get({
      documentId,
      suggestionsViewMode: 'PREVIEW_WITHOUT_SUGGESTIONS',
    });

    res.status(200).json(response.data);
  } catch (error) {
    console.error('Error getting document content:', error.message);
    res.status(500).send('Failed to get document content.');
  }
};

export const addShortToDocument = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).send('Unauthorized: User ID not found.');
    }

    const docs = getDocsClient(userId);
    const { documentId } = req.params;
    const { short } = req.body;

    if (!documentId || !short) {
      return res.status(400).send('Document ID and short object are required.');
    }

    // Get the current document to find the end and the TOC anchor
    const doc = await docs.documents.get({ documentId });
    const document = doc.data;

    // Find the end index of the document body
    const lastElement = document.body.content[document.body.content.length - 1];
    const insertionIndex = lastElement.endIndex; // Insert at the very end

    // 1. Add the short content (including page break) in a separate batch update
    const shortPageRequests = docHelpers.generateShortPageRequests(short, insertionIndex);
    if (shortPageRequests.length > 0) {
      await docs.documents.batchUpdate({
        documentId,
        requestBody: {
          requests: shortPageRequests,
        },
      });
    }

    res.status(200).json({ message: 'Short added successfully' });

    } catch (error) {
    console.error('Error adding short to document:', error.message);
    res.status(500).send('Failed to add short to document.');
  }
};

// The batchUpdate, getShortContentFromDoc, and updateShortContentInDoc functions
// need significant rework to be compatible with the new table-based structure.
// The logic of finding and replacing text ranges becomes much more complex.
// Below are placeholders or simplified versions.

export const batchUpdateDocument = async (req, res) => {
    // This function remains useful for generic updates but should be used with caution
    // as it can break the structured template.
    try {
        const userId = req.userId;
        if (!userId) {
          return res.status(401).send('Unauthorized: User ID not found.');
        }
    
        const docs = getDocsClient(userId);
        const { documentId } = req.params;
        const { requests } = req.body;
    
        if (!documentId || !requests || !Array.isArray(requests)) {
          return res.status(400).send('Document ID and an array of requests are required.');
        }
    
        const response = await docs.documents.batchUpdate({
          documentId,
          requestBody: {
            requests,
          },
        });
    
        res.status(200).json(response.data);
      } catch (error) {
        console.error('Error batch updating document:', error.message);
        res.status(500).send('Failed to batch update document.');
      }
};

export const getShortContentFromDoc = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).send('Unauthorized: User ID not found.');
    }

    const docs = getDocsClient(userId);
    const { documentId, shortId } = req.params;

    if (!documentId || !shortId) {
      return res.status(400).send('Document ID and Short ID are required.');
    }

    // Get the full document content
    const doc = await docs.documents.get({ documentId });
    const documentContent = doc.data;

    // Find the start index of the short's content based on SHORT_ID
    let shortStartIndex = -1;
    for (const element of documentContent.body.content) {
      if (element.paragraph && element.paragraph.elements) {
        const paragraphText = element.paragraph.elements
          .map((el) => (el.textRun && el.textRun.content) || '')
          .join('');

        if (paragraphText.includes(`SHORT_ID: ${shortId}`)) {
          shortStartIndex = element.startIndex;
          break;
        }
      }
    }

    if (shortStartIndex === -1) {
      return res.status(404).send('Short content not found in document.');
    }

    // Extract content from the found short section
    // We need to find the end of this short's section to slice correctly.
    // For simplicity, we'll assume the short content goes until the next SHORT_ID or end of document.
    let shortEndIndex = documentContent.body.content.length; // Default to end of document
    let foundShortSection = false;

    for (let i = 0; i < documentContent.body.content.length; i++) {
        const element = documentContent.body.content[i];
        if (element.paragraph && element.paragraph.elements) {
            const paragraphText = element.paragraph.elements
                .map(el => (el.textRun && el.textRun.content) || '')
                .join('');

            if (paragraphText.includes(`SHORT_ID: ${shortId}`)) {
                foundShortSection = true;
            } else if (foundShortSection && paragraphText.includes('SHORT_ID:')) {
                // Found the start of the next short, so this is the end of the current one
                shortEndIndex = i; // Index of the element that starts the next short
                break;
            }
        }
    }

    const shortContentElements = documentContent.body.content.slice(shortStartIndex, shortEndIndex);

    const shortData = {
        title: '',
        titleLine1: '',
        titleLine2: '',
        status: '',
        script: { idea: '', draft: '', hook: '', immersion: '', body: '', cta: '' },
        metadata: { tags: '', cta: '', imageIdeas: '', audioNotes: '' },
    };

    let currentSection = '';

    for (const element of shortContentElements) {
        if (element.paragraph && element.paragraph.elements) {
            const paragraphText = element.paragraph.elements
                .map(el => (el.textRun && el.textRun.content) || '')
                .join('').trim();

            if (paragraphText.startsWith(`SHORT_ID: ${shortId}`)) {
                // This is the short ID line, skip
                continue;
            } else if (paragraphText.startsWith('Title:')) {
                shortData.title = paragraphText.substring('Title:'.length).trim();
            } else if (paragraphText.startsWith('Shorts Title Line 1:')) {
                shortData.titleLine1 = paragraphText.substring('Shorts Title Line 1:'.length).trim();
            } else if (paragraphText.startsWith('Shorts Title Line 2:')) {
                shortData.titleLine2 = paragraphText.substring('Shorts Title Line 2:'.length).trim();
            } else if (paragraphText.startsWith('Status:')) {
                shortData.status = paragraphText.substring('Status:'.length).trim();
            } else if (paragraphText.startsWith('--- Script ---')) {
                currentSection = 'script';
            } else if (paragraphText.startsWith('--- Metadata ---')) {
                currentSection = 'metadata';
            } else if (currentSection === 'script') {
                if (paragraphText.startsWith('Idea:')) shortData.script.idea = paragraphText.substring('Idea:'.length).trim();
                else if (paragraphText.startsWith('Draft:')) shortData.script.draft = paragraphText.substring('Draft:'.length).trim();
                else if (paragraphText.startsWith('Hook:')) shortData.script.hook = paragraphText.substring('Hook:'.length).trim();
                else if (paragraphText.startsWith('Body:')) shortData.script.body = paragraphText.substring('Body:'.length).trim();
                else if (paragraphText.startsWith('CTA:')) shortData.script.cta = paragraphText.substring('CTA:'.length).trim();
            } else if (currentSection === 'metadata') {
                if (paragraphText.startsWith('Tags:')) shortData.metadata.tags = paragraphText.substring('Tags:'.length).trim();
                // Add other metadata fields if needed
            }
        }
    }

    res.status(200).json(shortData);
  } catch (error) {
    console.error('Error getting short content from document:', error.message);
    res.status(500).send('Failed to get short content from document.');
  }
};

export const updateShortContentInDoc = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).send('Unauthorized: User ID not found.');
    }

    const docs = getDocsClient(userId);
    const { documentId, shortId } = req.params;
    const { short: updatedShort } = req.body;

    if (!documentId || !shortId || !updatedShort) {
      return res.status(400).send('Document ID, Short ID, and updated short object are required.');
    }

    // 1. Get the full document content
    const doc = await docs.documents.get({ documentId });
    const documentContent = doc.data;

    let shortStartIndex = -1;
    let shortEndIndex = -1;

    // Find the start and end indices of the short's content
    for (let i = 0; i < documentContent.body.content.length; i++) {
      const element = documentContent.body.content[i];
      if (element.paragraph && element.paragraph.elements) {
        const paragraphText = element.paragraph.elements
          .map((el) => (el.textRun && el.textRun.content) || '')
          .join('');

        if (paragraphText.includes(`SHORT_ID: ${shortId}`)) {
          shortStartIndex = element.startIndex;
          // Assume the short content ends before the next SHORT_ID or end of document
          for (let j = i + 1; j < documentContent.body.content.length; j++) {
            const nextElement = documentContent.body.content[j];
            if (nextElement.paragraph && nextElement.paragraph.elements) {
              const nextParagraphText = nextElement.paragraph.elements
                .map((el) => (el.textRun && el.textRun.content) || '')
                .join('');
              if (nextParagraphText.includes('SHORT_ID:')) {
                shortEndIndex = nextElement.startIndex - 1; // End before the next short
                break;
              }
            }
          }
          if (shortEndIndex === -1) {
            shortEndIndex = documentContent.body.content[documentContent.body.content.length - 1].endIndex - 1; // End of document
          }
          break;
        }
      }
    }

    if (shortStartIndex === -1 || shortEndIndex === -1) {
      return res.status(404).send('Short content not found in document.');
    }

    // 2. Generate new content for the short
    // This should mirror the structure created by generateShortPageRequests
    const newContent = 
      `SHORT_ID: ${updatedShort.id}\n` +
      `Title: ${updatedShort.title || ''}\n` +
      `--------------------\n` +
      `Shorts Title Line 1: ${updatedShort.titleLine1 || ''}\n` +
      `Shorts Title Line 2: ${updatedShort.titleLine2 || ''}\n\n` +
      `Status: ${updatedShort.status || ''}\n\n` +
      `--- Script ---\n` +
      `Idea: ${updatedShort.script.idea || ''}\n` +
      `Draft: ${updatedShort.script.draft || ''}\n` +
      `Hook: ${updatedShort.script.hook || ''}\n` +
      `Body: ${updatedShort.script.body || ''}\n` +
      `CTA: ${updatedShort.script.cta || ''}\n\n` +
      `--- Metadata ---\n` +
      `Tags: ${updatedShort.metadata.tags || ''}\n` +
      `CTA: ${updatedShort.metadata.cta || ''}\n` +
      `Image Ideas: ${updatedShort.metadata.imageIdeas || ''}\n` +
      `Audio Notes: ${updatedShort.metadata.audioNotes || ''}\n`;

    const requests = [
      // Delete existing content
      {
        deleteContentRange: {
          range: { startIndex: shortStartIndex, endIndex: shortEndIndex },
        },
      },
      // Insert new content
      {
        insertText: {
          text: newContent,
          location: { index: shortStartIndex },
        },
      },
    ];

    // Re-apply styling for the SHORT_ID (hidden)
    requests.push({
      updateTextStyle: {
        range: { startIndex: shortStartIndex, endIndex: shortStartIndex + `SHORT_ID: ${updatedShort.id}`.length },
        textStyle: {
          fontSize: { magnitude: 1, unit: 'PT' },
          foregroundColor: { color: { rgbColor: { red: 1, green: 1, blue: 1 } } },
        },
        fields: 'fontSize,foregroundColor',
      },
    });

    // **FIX**: Reset style for the main content block
    const mainContentStartIndex = shortStartIndex + newContent.indexOf('Title:');
    requests.push({
        updateTextStyle: {
            range: {
                startIndex: mainContentStartIndex,
                endIndex: shortStartIndex + newContent.length,
            },
            textStyle: {
                foregroundColor: { color: { rgbColor: { red: 0, green: 0, blue: 0 } } },
                fontSize: { magnitude: 24, unit: 'PT' },
            },
            fields: 'foregroundColor,fontSize',
        },
    });

    const response = await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests,
      },
    });

    res.status(200).json(response.data);
  } catch (error) {
    console.error('Error updating short content in document:', error.message);
    res.status(500).send('Failed to update short content in document.');
  }
};

export const deleteShortFromDocument = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).send('Unauthorized: User ID not found.');
    }

    const docs = getDocsClient(userId);
    const { documentId, shortId } = req.params;

    if (!documentId || !shortId) {
      return res.status(400).send('Document ID and Short ID are required.');
    }

    // 1. Get the full document content
    const doc = await docs.documents.get({ documentId });
    const documentContent = doc.data;

    let shortStartIndex = -1;
    let shortEndIndex = -1;

    // Find the start and end indices of the short's content
    for (let i = 0; i < documentContent.body.content.length; i++) {
      const element = documentContent.body.content[i];
      if (element.paragraph && element.paragraph.elements) {
        const paragraphText = element.paragraph.elements
          .map((el) => (el.textRun && el.textRun.content) || '')
          .join('');

        if (paragraphText.includes(`SHORT_ID: ${shortId}`)) {
          shortStartIndex = element.startIndex;
          // Assume the short content ends before the next SHORT_ID or end of document
          for (let j = i + 1; j < documentContent.body.content.length; j++) {
            const nextElement = documentContent.body.content[j];
            if (nextElement.paragraph && nextElement.paragraph.elements) {
              const nextParagraphText = nextElement.paragraph.elements
                .map((el) => (el.textRun && el.textRun.content) || '')
                .join('');
              if (nextParagraphText.includes('SHORT_ID:')) {
                shortEndIndex = nextElement.startIndex - 1; // End before the next short
                break;
              }
            }
          }
          if (shortEndIndex === -1) {
            shortEndIndex = documentContent.body.content[documentContent.body.content.length - 1].endIndex - 1; // End of document
          }
          break;
        }
      }
    }

    if (shortStartIndex === -1 || shortEndIndex === -1) {
      return res.status(404).send('Short content not found in document.');
    }

    const requests = [
      {
        deleteContentRange: {
          range: { startIndex: shortStartIndex, endIndex: shortEndIndex },
        },
      },
    ];

    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests,
      },
    });

    res.status(204).send(); // No Content

  } catch (error) {
    console.error('Error deleting short from document:', error.message);
    res.status(500).send('Failed to delete short from document.');
  }
};

export const getAllShortsFromDocument = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).send('Unauthorized: User ID not found.');
    }

    const docs = getDocsClient(userId);
    const { documentId } = req.params;

    if (!documentId) {
      return res.status(400).send('Document ID is required.');
    }

    const doc = await docs.documents.get({ documentId });
    const documentContent = doc.data;

    const allShorts = parseShortsFromDocumentContent(documentContent);

    res.status(200).json(allShorts);

  } catch (error) {
    console.error('Error getting all shorts from document:', error.message);
    res.status(500).send('Failed to get all shorts from document.');
  }
};

export const parseShortsFromDocumentContent = (documentContent) => {
  const shorts = [];
  let currentShort = null;
  let currentSection = '';

  if (!documentContent || !documentContent.body || !documentContent.body.content) {
    return shorts;
  }

  for (const element of documentContent.body.content) {
    if (element.paragraph && element.paragraph.elements) {
      const paragraphText = element.paragraph.elements
        .map(el => (el.textRun && el.textRun.content) || '')
        .join('').trim();

      if (paragraphText.startsWith('SHORT_ID:')) {
        if (currentShort) {
          shorts.push(currentShort);
        }
        currentShort = { id: paragraphText.substring('SHORT_ID:'.length).trim(), script: {}, metadata: {} };
        currentSection = ''; // Reset section
      } else if (currentShort) {
        if (paragraphText.startsWith('Status:')) {
          currentShort.status = paragraphText.substring('Status:'.length).trim();
        } else if (paragraphText.startsWith('---')) {
          if (paragraphText.includes('Script')) currentSection = 'script';
          else if (paragraphText.includes('Metadata')) currentSection = 'metadata';
        } else if (currentSection === 'script') {
          if (paragraphText.startsWith('Idea:')) currentShort.script.idea = paragraphText.substring('Idea:'.length).trim();
          else if (paragraphText.startsWith('Draft:')) currentShort.script.draft = paragraphText.substring('Draft:'.length).trim();
          else if (paragraphText.startsWith('Hook:')) currentShort.script.hook = paragraphText.substring('Hook:'.length).trim();
          else if (paragraphText.startsWith('Body:')) currentShort.script.body = paragraphText.substring('Body:'.length).trim();
          else if (paragraphText.startsWith('CTA:')) currentShort.script.cta = paragraphText.substring('CTA:'.length).trim();
        } else if (currentSection === 'metadata') {
          if (paragraphText.startsWith('Tags:')) currentShort.metadata.tags = paragraphText.substring('Tags:'.length).trim();
          else if (paragraphText.startsWith('CTA:')) currentShort.metadata.cta = paragraphText.substring('CTA:'.length).trim();
          else if (paragraphText.startsWith('Image / B-Roll Ideas:')) currentShort.metadata.imageIdeas = paragraphText.substring('Image / B-Roll Ideas:'.length).trim();
          else if (paragraphText.startsWith('Audio / Music Notes:')) currentShort.metadata.audioNotes = paragraphText.substring('Audio / Music Notes:'.length).trim();
        }
      }
    }
  }
  if (currentShort) {
    shorts.push(currentShort);
  }
  console.log('parseShortsFromDocumentContent - Input documentContent:', documentContent);
  console.log('parseShortsFromDocumentContent - Parsed shorts:', shorts);
  return shorts;
};
