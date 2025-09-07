// This is a simplified middleware. In a real app, you'd handle sessions/JWTs
// and retrieve the user ID from the request (e.g., from a session cookie).
const authenticate = (req, res, next) => {
  console.log('Session in authenticate middleware:', req.session); // Added for debugging
  if (!req.session || !req.session.user || !req.session.user.id) {
    return res.status(401).send('Unauthorized: Please authenticate first.');
  }
  const userId = req.session.user.id; // Get userId from session

  // const tokens = getTokensForUser(userId);
  // if (!tokens) {
  //   return res.status(401).send('Unauthorized: Please authenticate first.');
  // }

  req.userId = userId; // Attach userId to request for later use
  next();
};

export default authenticate;
