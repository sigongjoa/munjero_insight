import * as youtubeService from '../../services/youtube.service.js';

export const fetchVideoDetails = async (req, res) => {
  try {
    const { youtubeUrl } = req.body;
    const userId = req.userId;

    if (!userId || !youtubeUrl) {
      return res.status(400).send('Missing required fields: userId, youtubeUrl.');
    }

    const videoDetails = await youtubeService.fetchVideoDetails(userId, youtubeUrl);

    if (!videoDetails) {
      return res.status(404).send('Video not found.');
    }

    res.status(200).json(videoDetails);
  } catch (error) {
    console.error('Error fetching YouTube video details:', error.message);
    res.status(500).send('Failed to fetch YouTube video details.');
  }
};

// In-memory store for scheduled tasks (for demonstration purposes)
export const scheduledTasks = [];

export const listPrivateVideos = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).send('Unauthorized: User ID not found.');
    }

    const allVideos = await youtubeService.listAllVideosInChannel(userId, 'mine');

    // Filter for private videos and map to expected format
    const privateVideos = allVideos.filter(
      (item) => item.status && item.status.privacyStatus === 'private'
    ).map(item => ({
      id: item.snippet.resourceId.videoId, // Use the actual video ID
      snippet: item.snippet,
      status: item.status,
    }));

    res.status(200).json(privateVideos);
  } catch (error) {
    console.error('Error listing private YouTube videos:', error.message);
    res.status(500).send('Failed to list private YouTube videos.');
  }
};

export const schedulePublish = async (req, res) => {
  try {
    const { videoId, publishTime, comments } = req.body;
    const userId = req.userId;

    if (!userId || !videoId || !publishTime) {
      return res.status(400).send('Missing required fields: userId, videoId, publishTime.');
    }

    const scheduledDate = new Date(publishTime);
    if (isNaN(scheduledDate.getTime())) {
      return res.status(400).send('Invalid publishTime format.');
    }

    scheduledTasks.push({
      userId,
      videoId,
      publishTime: scheduledDate,
      comments,
      status: 'pending',
    });

    console.log(`Scheduling video ${videoId} for publish at ${publishTime} with comments:`, comments);

    res.status(200).json({ message: 'Video scheduling request received.' });
  } catch (error) {
    console.error('Error scheduling video publish:', error.message);
    res.status(500).send('Failed to schedule video publish.');
  }
};