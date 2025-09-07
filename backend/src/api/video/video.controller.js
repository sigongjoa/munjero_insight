import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';

const prisma = new PrismaClient();

export const analyzeVideo = async (req, res) => {
  const { videoId } = req.params;
  const userId = req.session.userId;

  try {
    // 1. Find the video to ensure it exists and user has access
    const video = await prisma.video.findFirst({
      where: {
        videoId: videoId,
        project: { userId: userId },
      },
    });

    if (!video) {
      return res.status(404).send('Video not found or user does not have access.');
    }

    // 2. Update video status to Pending
    await prisma.video.update({
      where: { id: video.id },
      data: { status: 'Pending' },
    });

    // 3. Trigger Python service asynchronously
    const videoUrl = `https://www.youtube.com/watch?v=${video.videoId}`;
    fetch(`http://analyzer:8000/analyze_video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_url: videoUrl, video_id: video.videoId }),
    })
    .then(async pythonRes => {
        if (!pythonRes.ok) {
            const errorBody = await pythonRes.text();
            console.error(`Python service error for video ${video.videoId}: ${pythonRes.statusText}`, errorBody);
            // Revert status to Failed on error
            await prisma.video.update({ where: { id: video.id }, data: { status: 'Failed' } });
        }
        // On success, the python service will call the analysis-result endpoint.
    })
    .catch(async err => {
        console.error(`Failed to trigger analysis for video ${video.videoId}:`, err);
        await prisma.video.update({ where: { id: video.id }, data: { status: 'Failed' } });
    });

    // 4. Respond immediately to the client
    res.status(202).json({ message: 'Analysis has been initiated.' });

  } catch (error) {
    console.error('Error initiating video analysis:', error);
    res.status(500).send('Failed to initiate analysis.');
  }
};

export const updateVideoAnalysis = async (req, res) => {
  const { videoId } = req.params;
  const analysisData = req.body;

  try {
    // This endpoint is called by the Python service, so it's not tied to a user session.
    // For security, a secret key shared between services would be ideal.

    const video = await prisma.video.findUnique({ where: { videoId: videoId } });

    if (!video) {
      // Video might have been deleted since analysis started.
      return res.status(404).send('Video not found.');
    }

    await prisma.video.update({
      where: { videoId: videoId },
      data: {
        status: 'Completed',
        analysis: analysisData, // Save the full analysis JSON
      },
    });

    // Here you could also trigger the embedding process if it wasn't done in the python service
    // For example, call another python endpoint to embed the transcript

    res.status(200).send({ message: 'Analysis results received and stored.' });

  } catch (error) {
    console.error(`Error updating video analysis for ${videoId}:`, error);
    res.status(500).send('Failed to store analysis results.');
  }
};
