import React, { useState, useEffect } from 'react';
import { getProjects, askLLM, checkAuthStatus, analyzeChannel, analyzeVideo } from './api';
import './App.css';

const AnalysisModal = ({ video, onClose }) => {
  if (!video) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <button onClick={onClose} className="modal-close-button">X</button>
        <h2>{video.title}</h2>
        <h3>Analysis Results</h3>
        <pre>{JSON.stringify(video.analysis, null, 2)}</pre>
      </div>
    </div>
  );
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [projects, setProjects] = useState([]);
  const [channelUrl, setChannelUrl] = useState('');
  const [llmQuery, setLlmQuery] = useState('');
  const [llmResponse, setLlmResponse] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedVideo, setSelectedVideo] = useState(null);

  useEffect(() => {
    const verifyAuth = async () => {
      try {
        const data = await checkAuthStatus();
        if (data.authenticated) {
          setIsAuthenticated(true);
          fetchProjects();
        } else {
          setIsAuthenticated(false);
        }
      } catch (err) {
        setIsAuthenticated(false);
      } finally {
        setLoading(false);
      }
    };
    verifyAuth();
  }, []);

  const fetchProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getProjects();
      setProjects(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyzeChannel = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const newProject = await analyzeChannel(channelUrl);
      setProjects([newProject, ...projects.filter(p => p.id !== newProject.id)]);
      setChannelUrl('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyzeVideo = async (videoId) => {
    // Optimistic UI update
    setProjects(projects.map(p => ({
      ...p,
      videos: p.videos.map(v => v.videoId === videoId ? { ...v, status: 'Pending' } : v)
    })));

    try {
      await analyzeVideo(videoId);
    } catch (err) {
      setError(`Failed to start analysis for ${videoId}: ${err.message}`);
      // Revert UI update on failure
      fetchProjects();
    }
  };

  const handleAskLLM = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setLlmResponse('');
    try {
      const data = await askLLM({ query: llmQuery });
      setLlmResponse(data.answer);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const LoginButton = () => (
    <div className="login-container">
      <h2>Welcome to the Insight Platform</h2>
      <p>Please log in to continue</p>
      <a href="http://localhost:3000/auth/google" className="login-button">
        Login with Google
      </a>
    </div>
  );

  if (loading && !projects.length) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <LoginButton />;
  }

  return (
    <div className="App">
      <AnalysisModal video={selectedVideo} onClose={() => setSelectedVideo(null)} />
      <h1>YouTube Channel Insight Platform</h1>

      <section className="analyze-channel">
        <h2>Analyze New Channel</h2>
        <form onSubmit={handleAnalyzeChannel}>
          <input
            type="text"
            placeholder="Enter YouTube Channel URL"
            value={channelUrl}
            onChange={(e) => setChannelUrl(e.target.value)}
            required
          />
          <button type="submit" disabled={loading}>Analyze Channel</button>
        </form>
        <button onClick={fetchProjects} disabled={loading} style={{ marginLeft: '10px' }}>Refresh Projects</button>
      </section>

      <section className="projects-list">
        <h2>Your Analyzed Channels</h2>
        {error && <p style={{ color: 'red' }}>Error: {error}</p>}
        {loading && <p>Loading...</p>}
        {!loading && projects.length === 0 && <p>No channels analyzed yet. Add one above!</p>}
        <ul>
          {projects.map((project) => (
            <li key={project.id} className="project-card">
              <h3>{project.channelName}</h3>
              <h4>Videos ({project.videos.length})</h4>
              <ul className="video-list">
                {project.videos.map(video => (
                  <li key={video.id} className={`video-item status-${video.status.toLowerCase().replace(' ', '-')}`}>
                    <span className="video-title" onClick={() => video.status === 'Completed' && setSelectedVideo(video)}>
                      {video.title}
                    </span>
                    <span className="video-status">({video.status})</span>
                    {video.status === 'Not Analyzed' && (
                      <button onClick={() => handleAnalyzeVideo(video.videoId)} disabled={loading}>
                        Analyze
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section className="llm-query">
        <h2>Ask LLM for Insights</h2>
        <form onSubmit={handleAskLLM}>
          <textarea
            placeholder="Ask a question about your video data..."
            value={llmQuery}
            onChange={(e) => setLlmQuery(e.target.value)}
            required
          ></textarea>
          <button type="submit" disabled={loading}>Get Insight</button>
        </form>
        {llmResponse && (
          <div className="llm-response">
            <h3>LLM Response:</h3>
            <p>{llmResponse}</p>
          </div>
        )}
      </section>
    </div>
  );
}

export default App;