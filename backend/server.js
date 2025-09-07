import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { createClient } from "redis";
import RedisStore from "connect-redis";
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { syncProjectVideos } from './src/services/sync.service.js';
import authenticate from './src/middleware/auth.js';
import fetch from 'node-fetch';

const prisma = new PrismaClient();

// --- Setup ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3002;

// --- Redis Session Store ---
let redisClient = createClient({
  socket: {
    host: 'redis',
    port: 6379
  }
});
redisClient.connect().catch(console.error);
let redisStore = new RedisStore({ client: redisClient });

// --- CORS Configuration ---
const whitelist = ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:5174'];
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || whitelist.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};
app.use(cors(corsOptions));

// --- Common Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  store: redisStore,
  secret: process.env.SESSION_SECRET || 'keyboard cat',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false, // Set to false for development with sameSite: 'none'
    sameSite: 'none' // Allow cross-site cookie sending for development
  }
}));

// --- Auth Routes (Public) ---
import authRoutes from './src/api/auth/auth.routes.js';
app.use('/auth', authRoutes);

// --- Protected API Routes ---
app.use('/api', authenticate); // All routes below this are now protected

// --- Image Upload Handling (Multer) ---
const uploadsDir = path.join(__dirname, '../public', 'uploads', 'images');
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage: storage });

app.post('/api/upload/multiple-images', upload.array('images', 20), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).send('No files uploaded.');
  }
  const imageUrls = req.files.map(file => `${req.protocol}://${req.get('host')}/uploads/images/${file.filename}`);
  res.json(imageUrls);
});

// --- YouTube Routes ---
import channelRoutes from './src/api/channel/channel.routes.js';
import videoRoutes from './src/api/video/video.routes.js';
app.use('/api/channel', channelRoutes);
app.use('/api/video', videoRoutes);

// --- Project Management API (Prisma Based) ---

// GET all projects
app.get('/api/projects', async (req, res) => {
  try {
    const userId = req.session.userId;
    const projects = await prisma.project.findMany({
      where: { userId: userId },
      include: { videos: true },
    });
    res.status(200).json(projects);
  } catch (error) {
    console.error('Error reading projects:', error);
    res.status(500).send('Failed to retrieve projects.');
  }
});

// POST a new project is now handled by /api/channel/analyze

// PUT (update) a project
app.put('/api/projects/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.session.userId;
    const updatedProjectData = req.body;

    const updatedProject = await prisma.project.update({
      where: { id: projectId, userId: userId },
      data: updatedProjectData,
    });

    res.status(200).json(updatedProject);
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).send('Failed to update project.');
  }
});

// DELETE a project
app.delete('/api/projects/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.session.userId;

    await prisma.video.deleteMany({
      where: { projectId: projectId },
    });

    await prisma.project.delete({
      where: { id: projectId, userId: userId },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).send('Failed to delete project.');
  }
});

// --- Shorts Management API (Prisma Based) ---

// GET all shorts for a project
app.get('/api/projects/:projectId/shorts', async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.session.userId;

    const videos = await prisma.video.findMany({
      where: { projectId: projectId, project: { userId: userId } },
    });
    res.status(200).json(videos);
  } catch (error) {
    console.error('Error reading shorts:', error);
    res.status(500).send('Failed to retrieve shorts.');
  }
});

// POST a new short to a project
app.post('/api/projects/:projectId/shorts', async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.session.userId;
    const { videoId, title, description, uploadTime, duration, tags } = req.body;

    if (!videoId || !title || !uploadTime) {
      return res.status(400).send('Missing required fields: videoId, title, uploadTime.');
    }

    const newVideo = await prisma.video.create({
      data: {
        videoId: videoId,
        title: title,
        description: description || '',
        tags: tags || [],
        uploadTime: new Date(uploadTime),
        duration: duration,
        projectId: projectId,
      },
    });

    res.status(201).json(newVideo);
  } catch (error) {
    console.error('Error creating short:', error);
    res.status(500).send('Failed to create short.');
  }
});

// PUT (update) an existing short in a project
app.put('/api/projects/:projectId/shorts/:shortId', async (req, res) => {
  try {
    const { shortId } = req.params;
    const userId = req.session.userId;
    const updatedVideoData = req.body;

    const video = await prisma.video.findUnique({ where: { id: shortId } });
    if (!video || video.project.userId !== userId) {
        return res.status(404).send('Video not found or you do not have permission to edit it.');
    }
    
    const updatedVideo = await prisma.video.update({
      where: { id: shortId },
      data: updatedVideoData,
    });

    res.status(200).json(updatedVideo);
  } catch (error) {
    console.error('Error updating short:', error);
    res.status(500).send('Failed to update short.');
  }
});

// DELETE a short from a project
app.delete('/api/projects/:projectId/shorts/:shortId', async (req, res) => {
  try {
    const { shortId } = req.params;
    const userId = req.session.userId;

    const video = await prisma.video.findUnique({ where: { id: shortId } });
    if (!video || video.project.userId !== userId) {
        return res.status(404).send('Video not found or you do not have permission to delete it.');
    }

    await prisma.video.delete({
      where: { id: shortId },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting short:', error);
    res.status(500).send('Failed to delete short.');
  }
});

// --- Sync Route ---
app.post('/api/projects/:projectId/sync', async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.session.userId;

    syncProjectVideos(userId, projectId);

    res.status(202).json({ message: 'Sync process initiated.' });
  } catch (error) {
    console.error('Error initiating sync:', error);
    res.status(500).send('Failed to initiate sync.');
  }
});

// --- RAG Endpoint ---
app.post('/api/ask', async (req, res) => {
  try {
    const { query, max_tokens, temperature } = req.body;
    if (!query) {
      return res.status(400).send('Missing required field: query.');
    }

    console.log(`Calling Python microservice for LLM query: ${query}`);
    const pythonResponse = await fetch('http://analyzer:8000/ask_llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, max_tokens, temperature }),
    });

    if (!pythonResponse.ok) {
      throw new Error(`Python microservice LLM error: ${pythonResponse.statusText}`);
    }

    const llmResponse = await pythonResponse.json();
    res.status(200).json(llmResponse);
  } catch (error) {
    console.error('Error calling LLM microservice:', error.message);
    res.status(500).send('Failed to get response from LLM microservice.');
  }
});

// --- Static File Serving ---
app.use(express.static(path.join(__dirname, '../public')));

// --- Server Start ---
app.listen(PORT, () => {
  console.log(`Backend server is running on port ${PORT}`);
});
""
