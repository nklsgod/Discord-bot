require('dotenv').config();
const SpotifyWebApi = require('spotify-web-api-node');
const express = require('express');
const app = express();

// Überprüfe, ob die Umgebungsvariablen geladen wurden
console.log('Client ID:', process.env.SPOTIFY_CLIENT_ID ? 'Vorhanden' : 'Fehlt');
console.log('Client Secret:', process.env.SPOTIFY_CLIENT_SECRET ? 'Vorhanden' : 'Fehlt');

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: 'http://localhost:8888/callback'
});

app.get('/login', (req, res) => {
  const scopes = [
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'streaming'
  ];
  res.redirect(spotifyApi.createAuthorizeURL(scopes));
});

app.get('/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const data = await spotifyApi.authorizationCodeGrant(code);
    console.log('Refresh Token:', data.body['refresh_token']);
    res.send('Token erhalten! Du kannst diese Seite jetzt schließen.');
  } catch (error) {
    console.error('Error:', error);
    res.send('Fehler beim Authentifizieren');
  }
});

app.listen(8888, () => {
  console.log('Server läuft auf http://localhost:8888/login');
}); 