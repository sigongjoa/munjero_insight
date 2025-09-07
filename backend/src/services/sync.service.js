import * as youtubeService from './youtube.service.js';
import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';

const prisma = new PrismaClient();

export const syncProjectVideos = async (userId, projectId) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new Error(`Project with ID ${projectId} not found.`);
    }

    const channelId = project.channelId;

    console.log(`Starting sync for project ${projectId} (channel: ${channelId})`);

    const allYoutubeVideos = await youtubeService.listAllVideosInChannel(userId, channelId);

    for (const youtubeVideo of allYoutubeVideos) {
      const videoId = youtubeVideo.snippet.resourceId.videoId;
      const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

      // Fetch detailed video info from Data API
      const videoDetails = await youtubeService.fetchVideoDetails(userId, youtubeUrl);

      // Fetch analytics data from Analytics API
      const videoAnalytics = await youtubeService.fetchVideoAnalytics(userId, videoId);

      // --- Call Python Microservice for Video Analysis ---
      let videoAnalysisResults = {};
      try {
        console.log(`Calling Python microservice for video analysis: ${videoId}`);
        const pythonResponse = await fetch('http://analyzer:8000/analyze_video', {

          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ video_url: youtubeUrl, video_id: videoId }),
        });
        if (!pythonResponse.ok) {
          throw new Error(`Python microservice error: ${pythonResponse.statusText}`);
        }
        videoAnalysisResults = await pythonResponse.json();
        console.log(`Video analysis results for ${videoId}:`, videoAnalysisResults);
      } catch (pythonError) {
        console.error(`Failed to get video analysis from Python microservice for ${videoId}:`, pythonError.message);
        // Continue without analysis results if microservice fails
      }

      // Combine data and save to Prisma
      const upsertedVideo = await prisma.video.upsert({
        where: { videoId: videoId },
        update: {
          title: videoDetails?.snippet?.title || youtubeVideo.snippet.title,
          description: videoDetails?.snippet?.description,
          tags: videoDetails?.snippet?.tags || [],
          uploadTime: new Date(videoDetails?.snippet?.publishedAt || youtubeVideo.snippet.publishedAt),
          duration: videoDetails?.contentDetails?.duration ? parseYouTubeDuration(videoDetails.contentDetails.duration) : null,
          views: videoDetails?.statistics?.viewCount ? BigInt(videoDetails.statistics.viewCount) : null,
          likes: videoDetails?.statistics?.likeCount ? BigInt(videoDetails.statistics.likeCount) : null,
          dislikes: videoDetails?.statistics?.dislikeCount ? BigInt(videoDetails.statistics.dislikeCount) : null,
          commentsCount: videoDetails?.statistics?.commentCount ? parseInt(videoDetails.statistics.commentCount) : null,
          impressions: videoAnalytics?.impressions ? BigInt(videoAnalytics.impressions) : null,
          ctr: videoAnalytics?.ctr ? parseFloat(videoAnalytics.ctr) : null,
          avgWatchTime: videoAnalytics?.averageViewDuration ? parseInt(videoAnalytics.averageViewDuration) : null,
          retentionCurve: videoAnalytics?.averageViewPercentage ? { percentage: videoAnalytics.averageViewPercentage } : null, // Simplified for now
          hookLength: videoAnalysisResults.hook_length, // Assuming analysis provides this
          ctaPosition: videoAnalysisResults.cta_position, // Assuming analysis provides this
          sceneCuts: videoAnalysisResults.scene_cuts, // Assuming analysis provides this
          scriptSegments: videoAnalysisResults.transcript ? [{ text: videoAnalysisResults.transcript, start: 0, end: 0 }] : null, // Simplified
          subtitleText: videoAnalysisResults.ocr_text, // Assuming analysis provides this
          editingPattern: videoAnalysisResults.editing_pattern, // Assuming analysis provides this
        },
        create: {
          videoId: videoId,
          title: videoDetails?.snippet?.title || youtubeVideo.snippet.title,
          description: videoDetails?.snippet?.description,
          tags: videoDetails?.snippet?.tags || [],
          uploadTime: new Date(videoDetails?.snippet?.publishedAt || youtubeVideo.snippet.publishedAt),
          duration: videoDetails?.contentDetails?.duration ? parseYouTubeDuration(videoDetails.contentDetails.duration) : null,
          views: videoDetails?.statistics?.viewCount ? BigInt(videoDetails.statistics.viewCount) : null,
          likes: videoDetails?.statistics?.likeCount ? BigInt(videoDetails.statistics.likeCount) : null,
          dislikes: videoDetails?.statistics?.dislikeCount ? BigInt(videoDetails.statistics.dislikeCount) : null,
          commentsCount: videoDetails?.statistics?.commentCount ? parseInt(videoDetails.statistics.commentCount) : null,
          impressions: videoAnalytics?.impressions ? BigInt(videoAnalytics.impressions) : null,
          ctr: videoAnalytics?.ctr ? parseFloat(videoAnalytics.ctr) : null,
          avgWatchTime: videoAnalytics?.averageViewDuration ? parseInt(videoAnalytics.averageViewDuration) : null,
          retentionCurve: videoAnalytics?.averageViewPercentage ? { percentage: videoAnalytics.averageViewPercentage } : null, // Simplified for now
          hookLength: videoAnalysisResults.hook_length, // Assuming analysis provides this
          ctaPosition: videoAnalysisResults.cta_position, // Assuming analysis provides this
          sceneCuts: videoAnalysisResults.scene_cuts, // Assuming analysis provides this
          scriptSegments: videoAnalysisResults.transcript ? [{ text: videoAnalysisResults.transcript, start: 0, end: 0 }] : null, // Simplified
          subtitleText: videoAnalysisResults.ocr_text, // Assuming analysis provides this
          editingPattern: videoAnalysisResults.editing_pattern, // Assuming analysis provides this
          projectId: projectId,
        },
      });
      console.log(`Upserted video: ${upsertedVideo.title} (${upsertedVideo.videoId})`);

      // --- Store Embeddings in ChromaDB via Python Microservice ---
      if (videoAnalysisResults.transcript) {
        try {
          console.log(`Storing embeddings for video ${videoId}...`);
          const embeddingResponse = await fetch('http://analyzer:8000/store_embeddings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: videoAnalysisResults.transcript,
              metadata: { video_id: videoId, title: upsertedVideo.title, project_id: projectId },
              id: `transcript-${videoId}`,
            }),
          });
          if (!embeddingResponse.ok) {
            throw new Error(`Python microservice embedding error: ${embeddingResponse.statusText}`);
          }
          console.log(`Embeddings stored for ${videoId}.`);
        } catch (embeddingError) {
          console.error(`Failed to store embeddings for ${videoId}:`, embeddingError.message);
        }
      }
    }
    console.log(`Sync for project ${projectId} completed successfully.`);
  } catch (error) {
    console.error(`Error during sync for project ${projectId}:`, error.message);
    throw error;
  }
};

// Helper function to parse YouTube duration (e.g., PT1H2M3S -> seconds)
function parseYouTubeDuration(duration) {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;

  const hours = parseInt(match[1]) || 0;
  const minutes = parseInt(match[2]) || 0;
  const seconds = parseInt(match[3]) || 0;

  return hours * 3600 + minutes * 60 + seconds;
}