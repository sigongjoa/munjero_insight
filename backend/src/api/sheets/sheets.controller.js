import { google } from 'googleapis';
import oauth2Client from '../../config/googleClient.js';
import { getTokensForUser } from '../auth/auth.controller.js';

// Helper to get a configured Sheets API client for a user
const getSheetsClient = (userId) => {
  const tokens = getTokensForUser(userId);
  if (!tokens) {
    throw new Error('User not authenticated.');
  }
  oauth2Client.setCredentials(tokens);
  return google.sheets({ version: 'v4', auth: oauth2Client });
};

export const createSpreadsheet = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).send('Unauthorized: User ID not found.');
    }

    const sheets = getSheetsClient(userId);
    const { title } = req.body;

    if (!title) {
      return res.status(400).send('Spreadsheet title is required.');
    }

    const resource = {
      properties: {
        title,
      },
    };

    const response = await sheets.spreadsheets.create({
      resource,
      fields: 'spreadsheetId,spreadsheetUrl',
    });

    res.status(200).json(response.data);
  } catch (error) {
    console.error('Error creating spreadsheet:', error.message);
    res.status(500).send('Failed to create spreadsheet.');
  }
};

export const getSpreadsheetValues = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).send('Unauthorized: User ID not found.');
    }

    const sheets = getSheetsClient(userId);
    const { spreadsheetId, range } = req.params;

    if (!spreadsheetId || !range) {
      return res.status(400).send('Spreadsheet ID and range are required.');
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    res.status(200).json(response.data);
  } catch (error) {
    console.error('Error getting spreadsheet values:', error.message);
    res.status(500).send('Failed to get spreadsheet values.');
  }
};

export const appendSpreadsheetValues = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).send('Unauthorized: User ID not found.');
    }

    const sheets = getSheetsClient(userId);
    const { spreadsheetId } = req.params;
    const range = decodeURIComponent(req.params.range);
    const { values } = req.body; // values should be an array of arrays, e.g., [[1,2],[3,4]]
    const { valueInputOption } = req.query; // Get valueInputOption from query parameter

    if (!spreadsheetId || !range || !values || !valueInputOption) {
      return res.status(400).send('Spreadsheet ID, range, values, and valueInputOption are required.');
    }

    const resource = {
      values,
    };

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption, // Use valueInputOption from query
      resource,
    });

    res.status(200).json(response.data);
  } catch (error) {
  console.error('Error appending spreadsheet values:', JSON.stringify(error, null, 2));
  if (error.response && error.response.data) {
    console.error('Google API response:', JSON.stringify(error.response.data, null, 2));
  }
  res.status(500).send('Failed to append spreadsheet values.');
}
};

export const updateSpreadsheetValues = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).send('Unauthorized: User ID not found.');
    }

    const sheets = getSheetsClient(userId);
    const { spreadsheetId, range } = req.params;
    const { values } = req.body; // values should be an array of arrays, e.g., [[1,2],[3,4]]

    if (!spreadsheetId || !range || !values) {
      return res.status(400).send('Spreadsheet ID, range, and values are required.');
    }

    const resource = {
      values,
    };

    const response = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'RAW', // User entered values, no parsing
      resource,
    });

    res.status(200).json(response.data);
  } catch (error) {
    console.error('Error updating spreadsheet values:', error.message);
    res.status(500).send('Failed to update spreadsheet values.');
  }
};

export const clearSpreadsheetValues = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).send('Unauthorized: User ID not found.');
    }

    const sheets = getSheetsClient(userId);
    const { spreadsheetId, range } = req.params;

    if (!spreadsheetId || !range) {
      return res.status(400).send('Spreadsheet ID and range are required.');
    }

    const response = await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range,
    });

    res.status(200).json(response.data);
  } catch (error) {
    console.error('Error clearing spreadsheet values:', error.message);
    res.status(500).send('Failed to clear spreadsheet values.');
  }
};
