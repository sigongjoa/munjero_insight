import { getGoogleClient } from '../utils/googleClientUtils.js';import { PrismaClient } from '@prisma/client';const prisma = new PrismaClient();

// Helper to extract video ID from YouTube URL
const extractVideoId = (url) => {
  const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const matches = url.match(regex);
  return matches ? matches[1] : null;
};

const getUserTokens = async (userId) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.accessToken) {
    throw new Error('User not found or missing Google credentials.');
  }
  return { access_token: user.accessToken, refresh_token: user.refreshToken };
};

export const fetchVideoDetails = async (userId, youtubeUrl) => {
  try {
    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      throw new Error('Invalid YouTube URL.');
    }

    const tokens = await getUserTokens(userId);
    const youtube = getGoogleClient(tokens, 'youtube', 'v3');

    const response = await youtube.videos.list({
      part: 'snippet,contentDetails,statistics',
      id: videoId,
    });

    if (!response.data.items || response.data.items.length === 0) {
      return null; // Video not found
    }

    return response.data.items[0];
  } catch (error) {
    console.error('Error fetching YouTube video details in service:', error.message);
    throw error;
  }
};

export const publishVideo = async (userId, videoId) => {
  try {
    const tokens = await getUserTokens(userId);
    const youtube = getGoogleClient(tokens, 'youtube', 'v3');

    await youtube.videos.update({
      part: 'status',
      requestBody: {
        id: videoId,
        status: { privacyStatus: 'public' },
      },
    });
    console.log(`Video ${videoId} published successfully.`);
  } catch (error) {
    console.error(`Error publishing video ${videoId} in service:`, error.message);
    throw error;
  }
};

export const postComment = async (userId, videoId, commentText) => {
  try {
    const tokens = await getUserTokens(userId);
    const youtube = getGoogleClient(tokens, 'youtube', 'v3');

    await youtube.commentThreads.insert({
      part: 'snippet',
      requestBody: {
        snippet: {
          videoId: videoId,
          topLevelComment: {
            snippet: { textOriginal: commentText },
          },
        },
      },
    });
    console.log(`Comment posted to video ${videoId}: ${commentText}`);
  } catch (error) {
    console.error(`Error posting comment to video ${videoId} in service:`, error.message);
    throw error;
  }
};

export const listAllVideosInChannel = async (userId, channelId = 'mine') => {
  try {
    const tokens = await getUserTokens(userId);
    const youtube = getGoogleClient(tokens, 'youtube', 'v3');

    let uploadsPlaylistId;
    if (channelId === 'mine') {
      const channelResponse = await youtube.channels.list({
        part: 'contentDetails',
        mine: true,
      });

      if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
        return []; // No channel found for user
      }
      uploadsPlaylistId = channelResponse.data.items[0].contentDetails.relatedPlaylists.uploads;
    } else {
      // For a specific channelId, we need to fetch its uploads playlist
      const channelResponse = await youtube.channels.list({
        part: 'contentDetails',
        id: channelId,
      });
      if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
        return []; // Channel not found
      }
      uploadsPlaylistId = channelResponse.data.items[0].contentDetails.relatedPlaylists.uploads;
    }

    let allVideos = [];
    let nextPageToken = null;
    do {
      const playlistItemsResponse = await youtube.playlistItems.list({
        part: 'snippet,status',
        playlistId: uploadsPlaylistId,
        maxResults: 50, // Max results per page
        pageToken: nextPageToken,
      });

      allVideos = allVideos.concat(playlistItemsResponse.data.items);
      nextPageToken = playlistItemsResponse.data.nextPageToken;
    } while (nextPageToken);

    return allVideos;
  } catch (error) {
    console.error('Error listing all videos in channel in service:', error.message);
    throw error;
  }
};

export const fetchVideoAnalytics = async (userId, videoId) => {
  try {
    const tokens = await getUserTokens(userId);
    const youtubeAnalytics = getGoogleClient(tokens, 'youtubeAnalytics', 'v2');

    const today = new Date();
    const endDate = today.toISOString().split('T')[0]; // YYYY-MM-DD
    const startDate = '2005-01-01'; // YouTube's inception or a reasonable start date

    const response = await youtubeAnalytics.reports.query({
      ids: 'channel==MINE', // Use 'channel==MINE' for the authenticated user's channel
      startDate: startDate,
      endDate: endDate,
      metrics: 'views,likes,dislikes,comments,impressions,ctr,averageViewDuration,averageViewPercentage',
      dimensions: 'video',
      filters: `video==${videoId}`,
    });

    if (!response.data.rows || response.data.rows.length === 0) {
      return null; // No analytics data found
    }

    // The response rows are typically [video_id, metric1, metric2, ...]
    // We need to map these to meaningful names.
    const columnHeaders = response.data.columnHeaders.map(header => header.name);
    const analyticsData = {};
    response.data.rows[0].forEach((value, index) => {
      analyticsData[columnHeaders[index]] = value;
    });

    return analyticsData;
  } catch (error) {
    console.error('Error fetching YouTube analytics in service:', error.message);
    throw error;
  }
};