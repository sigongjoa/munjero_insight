import oauth2Client from '../../config/googleClient.js';
import { getGoogleClient } from '../../utils/googleClientUtils.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const googleAuth = (req, res) => {
  const defaultScopes = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/youtube.readonly', // Added for YouTube data access
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/youtube.force-ssl',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/documents',
    'https://www.googleapis.com/auth/yt-analytics.readonly',
  ];

  const requestedScopes = req.query.scopes ? req.query.scopes.split(',').map(s => `https://www.googleapis.com/auth/${s.trim()}`) : [];
  const scopes = [...new Set([...defaultScopes, ...requestedScopes])];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
  });

  res.redirect(authUrl);
};

export const googleAuthCallback = async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = getGoogleClient(tokens, 'oauth2', 'v2');
    const userInfo = await oauth2.userinfo.get();
    const googleId = userInfo.data.id;
    const userEmail = userInfo.data.email;
    const userName = userInfo.data.name;

    const user = await prisma.user.upsert({
      where: { email: userEmail },
      update: {
        googleId: googleId,
        name: userName,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
      },
      create: {
        googleId: googleId,
        email: userEmail,
        name: userName,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
      },
    });

    req.session.user = { id: user.id }; // Store Prisma user ID in session

    console.log('Tokens received and stored in DB for user:', user.id);
    console.log('User ID stored in session:', req.session.user.id);
    console.log('Session object after setting user:', req.session);

    res.redirect('http://localhost:5174');
  } catch (error) {
    console.error('Error retrieving access token or updating user:', error.message);
    res.status(500).send('Authentication failed');
  }
};

  export const checkAuthStatus = (req, res) => {
  console.log('Session in checkAuthStatus:', req.session);
  if (req.session.user && req.session.user.id) {
    res.status(200).json({ authenticated: true, user: req.session.user });
  } else {
    res.status(401).json({ authenticated: false });
  }
};

export const getMe = async (req, res) => {
  try {
    const userId = req.session.user.id;
    if (!userId) {
      return res.status(401).send('Unauthorized');
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.accessToken) {
      return res.status(401).send('User not found or missing tokens');
    }

    const tokens = {
      access_token: user.accessToken,
      refresh_token: user.refreshToken,
    };

    const youtube = getGoogleClient(tokens, 'youtube', 'v3');
    const oauth2 = getGoogleClient(tokens, 'oauth2', 'v2');

    const channelResponse = await youtube.channels.list({
      mine: true,
      part: 'id,snippet',
    });

    const userInfoResponse = await oauth2.userinfo.get();

    if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
      return res.status(200).json(userInfoResponse.data);
    }

    const userProfile = {
      ...userInfoResponse.data,
      channelId: channelResponse.data.items[0].id,
      channelTitle: channelResponse.data.items[0].snippet.title,
      channelThumbnail: channelResponse.data.items[0].snippet.thumbnails.default.url,
    };

    res.status(200).json(userProfile);
  } catch (error) {
    console.error('Error fetching user profile:', error.message);
    res.status(500).send('Failed to fetch user profile.');
  }
};

