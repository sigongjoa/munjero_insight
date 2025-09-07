const API_BASE_URL = 'http://localhost:3000'; // Corrected port

// Helper to include credentials in all fetch requests
const fetchWithCredentials = (url, options = {}) => {
  const defaultOptions = {
    credentials: 'include', // Include cookies in all requests
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };
  return fetch(url, defaultOptions);
};

export const checkAuthStatus = async () => {
  const response = await fetchWithCredentials(`${API_BASE_URL}/auth/status`);
  if (!response.ok) {
    // If the status is 401, it's a normal unauthenticated case.
    if (response.status === 401) {
      return response.json();
    }
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
};

export const analyzeChannel = async (channelUrl) => {
  const response = await fetchWithCredentials(`${API_BASE_URL}/api/channel/analyze`, {
    method: 'POST',
    body: JSON.stringify({ channelUrl }),
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
};

export const analyzeVideo = async (videoId) => {
  const response = await fetchWithCredentials(`${API_BASE_URL}/api/video/${videoId}/analyze`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
};

export const getProjects = async () => {
  const response = await fetchWithCredentials(`${API_BASE_URL}/api/projects`);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
};

export const syncProject = async (projectId) => {
  const response = await fetchWithCredentials(`${API_BASE_URL}/api/projects/${projectId}/sync`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
};

export const askLLM = async (queryData) => {
  const response = await fetchWithCredentials(`${API_BASE_URL}/api/ask`, {
    method: 'POST',
    body: JSON.stringify(queryData),
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
};
