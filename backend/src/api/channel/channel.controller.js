import { PrismaClient } from '@prisma/client';
import { getGoogleClient } from '../../utils/googleClientUtils.js';
import { google } from 'googleapis';

const prisma = new PrismaClient();

// Helper function to extract channel ID from various YouTube URL formats
const getChannelIdFromUrl = async (youtube, url) => {
  // Match /channel/UC... format
  let match = url.match(/\/channel\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];

  // Match /c/customUrl or /user/username format
  match = url.match(/\/(c|user)\/([a-zA-Z0-9_-]+)/);
  if (match) {
    const searchResponse = await youtube.search.list({
      part: 'snippet',
      q: match[2],
      type: 'channel',
      maxResults: 1,
    });
    if (searchResponse.data.items.length > 0) {
      return searchResponse.data.items[0].snippet.channelId;
    }
  }

  // Match /@handle format
  match = url.match(/@([a-zA-Z0-9_.-]+)/);
  if (match) {
    // The YouTube API v3 does not have a direct way to resolve a handle (@name) to a channel ID as of late 2023.
    // The recommended approach is to use search, but it can be unreliable.
    // For this implementation, we will rely on search as a fallback.
    const searchResponse = await youtube.search.list({
      part: 'snippet',
      q: match[1],
      type: 'channel',
      maxResults: 1,
    });
    if (searchResponse.data.items.length > 0) {
      return searchResponse.data.items[0].snippet.channelId;
    }
  }

  throw new Error('Could not determine channel ID from the provided URL.');
};

export const analyzeChannel = async (req, res) => {
  const { channelUrl } = req.body;
  const userId = req.session.userId;

  if (!channelUrl) {
    return res.status(400).send('channelUrl is required');
  }

  try {
    // 1. Get user tokens from DB
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.accessToken) {
      return res.status(401).send('User not found or missing Google credentials.');
    }

    const tokens = { access_token: user.accessToken, refresh_token: user.refreshToken };
    const youtube = google.youtube({ version: 'v3', auth: getGoogleClient(tokens) });

    // 2. Extract Channel ID
    const channelId = await getChannelIdFromUrl(youtube, channelUrl);

    // 3. Fetch Channel Data
    const channelResponse = await youtube.channels.list({
      part: 'snippet,statistics,contentDetails',
      id: channelId,
    });

    if (channelResponse.data.items.length === 0) {
      return res.status(404).send('YouTube channel not found.');
    }

    const channelData = channelResponse.data.items[0];
    const uploadsPlaylistId = channelData.contentDetails.relatedPlaylists.uploads;

    // 4. Upsert Project in DB
    const project = await prisma.project.upsert({
      where: { channelId: channelId },
      update: {
        channelName: channelData.snippet.title,
        description: channelData.snippet.description.substring(0, 200),
        // Potentially update other stats here if needed
      },
      create: {
        userId: userId,
        channelId: channelId,
        channelName: channelData.snippet.title,
        description: channelData.snippet.description.substring(0, 200),
      },
    });

    // 5. Fetch All Videos from the channel
    let allVideos = [];
    let nextPageToken = null;
    do {
      const playlistResponse = await youtube.playlistItems.list({
        part: 'snippet,contentDetails',
        playlistId: uploadsPlaylistId,
        maxResults: 50, // Max allowed by API
        pageToken: nextPageToken,
      });

      const videoIds = playlistResponse.data.items.map(item => item.contentDetails.videoId).join(',');
      const videoDetailsResponse = await youtube.videos.list({
        part: 'statistics,snippet',
        id: videoIds
      });

      const videosWithStats = playlistResponse.data.items.map(item => {
        const videoDetail = videoDetailsResponse.data.items.find(d => d.id === item.contentDetails.videoId);
        return { ...item, statistics: videoDetail ? videoDetail.statistics : {} };
      });

      allVideos.push(...videosWithStats);
      nextPageToken = playlistResponse.data.nextPageToken;
    } while (nextPageToken);

    // 6. Upsert Videos in DB
    for (const videoData of allVideos) {
      await prisma.video.upsert({
        where: { videoId: videoData.contentDetails.videoId },
        update: {
          title: videoData.snippet.title,
          description: videoData.snippet.description,
          uploadTime: new Date(videoData.snippet.publishedAt),
          // Update stats if needed
        },
        create: {
          videoId: videoData.contentDetails.videoId,
          title: videoData.snippet.title,
          description: videoData.snippet.description,
          uploadTime: new Date(videoData.snippet.publishedAt),
          tags: videoData.snippet.tags || [],
          projectId: project.id,
        },
      });
    }

    // 7. Return all data to frontend
    const fullProjectData = await prisma.project.findUnique({
      where: { id: project.id },
      include: { videos: true },
    });

    res.status(200).json(fullProjectData);

  } catch (error) {
    console.error('Error analyzing channel:', error);
    res.status(500).send(`Failed to analyze channel: ${error.message}`);
  }
};
