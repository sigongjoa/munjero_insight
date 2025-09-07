import { google } from 'googleapis';
import oauth2Client from '../config/googleClient.js';

export const getGoogleClient = (tokens, apiName, apiVersion) => {
  if (!tokens) {
    throw new Error('User tokens not found.');
  }
  oauth2Client.setCredentials(tokens);
  return google[apiName]({ version: apiVersion, auth: oauth2Client });
};
