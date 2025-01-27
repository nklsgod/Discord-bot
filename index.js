require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, getVoiceConnection, VoiceConnectionStatus } = require('@discordjs/voice');
const axios = require('axios');
const OpenAI = require('openai');
const ytdl = require('ytdl-core');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildPresences
  ]
});

// Spotify-Token global cachen, damit wir es nicht bei jeder Anfrage neu abrufen müssen (simple Variante)
let spotifyAccessToken = null;
let spotifyTokenExpiresAt = 0;

// Funktion, um Spotify-Token zu holen (Client Credentials Flow)
async function getSpotifyToken() {
  const now = Date.now();
  console.log('🔄 Prüfe Spotify-Token...');
  
  // Falls das Token noch gültig ist, verwenden wir es
  if (spotifyAccessToken && now < spotifyTokenExpiresAt) {
    console.log('✅ Verwende bestehendes Spotify-Token');
    return spotifyAccessToken;
  }

  try {
    console.log('🔑 Hole neues Spotify-Token...');
    const resp = await axios.post('https://accounts.spotify.com/api/token', null, {
      params: { grant_type: 'client_credentials' },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:
          'Basic ' +
          Buffer.from(
            process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
          ).toString('base64'),
      },
    });
    console.log('✅ Neues Spotify-Token erfolgreich geholt');
    spotifyAccessToken = resp.data.access_token;
    // Ablaufzeit in ms bestimmen
    spotifyTokenExpiresAt = now + resp.data.expires_in * 1000;
    return spotifyAccessToken;
  } catch (err) {
    console.error('❌ Fehler beim Abrufen des Spotify-Tokens:', err);
    return null;
  }
}

// Nach den requires, vor dem client setup
let isMuted = false;
let volume = 1.0; // 100% Lautstärke

// Hilfsfunktion für Lautstärke
function setVolume(resource, newVolume) {
  if (resource && resource.volume) {
    resource.volume.setVolume(newVolume);
    console.log(`🔊 Lautstärke auf ${newVolume * 100}% gesetzt`);
  }
}

// Minimal: Audio-Player erstellen, der jeweils einen Track abspielt
const player = createAudioPlayer();

// Event-Listener: wenn Song fertig ist
player.on(AudioPlayerStatus.Idle, () => {
  console.log('🎵 Track ist zu Ende oder Player ist idle.');
});

client.once('ready', () => {
  console.log(`🤖 Bot eingeloggt als: ${client.user.tag}`);
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function chatWithGPT(message) {
  try {
    console.log('💭 Sende Anfrage an ChatGPT...');
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "Du bist ein freundlicher Discord Bot. Antworte kurz und prägnant."
        },
        {
          role: "user",
          content: message
        }
      ],
      max_tokens: 150
    });
    
    console.log('✅ Antwort von ChatGPT erhalten');
    return completion.choices[0].message.content;
  } catch (error) {
    console.error('❌ ChatGPT Fehler:', error);
    return 'Entschuldigung, ich konnte keine Antwort generieren.';
  }
}

// Ersetze die playYouTube Funktion
async function playYouTube(url, channel, message) {
  try {
    console.log('🎵 Erstelle Audio-Stream...');
    
    // Prüfe ob bereits eine Verbindung besteht
    let connection = getVoiceConnection(channel.guild.id);
    if (connection) {
      connection.destroy();
    }

    // Neue Verbindung erstellen
    connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false
    });

    // Stream erstellen
    const stream = ytdl(url, {
      filter: 'audioonly',
      quality: 'highestaudio',
      highWaterMark: 1 << 25
    });

    const resource = createAudioResource(stream, {
      inputType: 'webm/opus',
      inlineVolume: true
    });

    resource.volume.setVolume(isMuted ? 0 : volume);

    // Verbinde Player und Connection
    connection.subscribe(player);
    player.play(resource);

    // Video Info abrufen
    const videoInfo = await ytdl.getBasicInfo(url);
    console.log(`✅ Spiele nun: "${videoInfo.videoDetails.title}"`);
    return message.reply(`Spiele jetzt: **${videoInfo.videoDetails.title}**`);

  } catch (error) {
    console.error('❌ Fehler beim Abspielen:', error);
    throw error;
  }
}

// Füge diese Event-Listener am Anfang der Datei hinzu (nach der player-Definition)
player.on('stateChange', (oldState, newState) => {
  console.log(`Player Status: ${oldState.status} -> ${newState.status}`);
  if (newState.status === AudioPlayerStatus.Playing) {
    console.log('Audio wird jetzt abgespielt!');
  }
  if (newState.status === AudioPlayerStatus.Idle) {
    console.log('Audio-Wiedergabe beendet.');
  }
});

player.on('error', error => {
  console.error('Player Fehler:', error);
});

// Füge einen Status-Event-Listener für den Player hinzu
player.on(AudioPlayerStatus.Playing, () => {
  console.log('🎵 Player Status: Spielt');
});

player.on(AudioPlayerStatus.Buffering, () => {
  console.log('🎵 Player Status: Buffering');
});

player.on(AudioPlayerStatus.AutoPaused, () => {
  console.log('🎵 Player Status: AutoPaused');
});

player.on(AudioPlayerStatus.Paused, () => {
  console.log('🎵 Player Status: Paused');
});

client.on('messageCreate', async (message) => {
  // Filter: keine Bot-Nachrichten und Command-Prefix '!'
  if (message.author.bot) return;
  if (!message.content.startsWith('!')) return;

  const args = message.content.slice(1).split(' ');
  const command = args.shift().toLowerCase();

  if (command === 'play') {
    console.log('📝 Neuer Play-Befehl erhalten');
    
    const { channel } = message.member?.voice || {};
    if (!channel) {
      console.log('❌ Benutzer ist in keinem Voice-Channel');
      return message.reply('Du musst in einem Voice-Channel sein!');
    }
    console.log(`✅ Benutzer ist im Voice-Channel: ${channel.name}`);

    const query = args.join(' ');
    if (!query) {
      console.log('❌ Keine Suchanfrage angegeben');
      return message.reply('Bitte gib einen Link oder Suchbegriff an!');
    }
    console.log(`🔍 Suchanfrage: "${query}"`);

    let searchTerm = query;
    const spotifyRegex = /https?:\/\/(open\.)?spotify\.com\/track\/([A-Za-z0-9]+)/;
    const spotifyMatch = query.match(spotifyRegex);

    if (spotifyMatch) {
      // Spotify-Link zu YouTube-Suche konvertieren
      console.log('🎯 Spotify-Link erkannt');
      const trackId = spotifyMatch[2];
      const token = await getSpotifyToken();
      if (!token) {
        return message.reply('Konnte keinen Spotify-Token abrufen.');
      }

      try {
        console.log('🔍 Rufe Spotify-Track-Informationen ab...');
        const trackResp = await axios.get(`https://api.spotify.com/v1/tracks/${trackId}`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        const trackInfo = trackResp.data;
        const artist = trackInfo.artists[0]?.name ?? '';
        const title = trackInfo.name;
        searchTerm = `${artist} - ${title}`;
        console.log(`✅ Spotify-Track gefunden: "${title}" von "${artist}"`);
        message.channel.send(`Spotify-Track gefunden: **${title}** von **${artist}**. Suche auf YouTube...`);
      } catch (err) {
        console.error('❌ Spotify-Fehler:', err);
        return message.reply('Fehler beim Abrufen der Song-Informationen von Spotify!');
      }
    }

    try {
      console.log(`🔍 Suche auf YouTube: "${searchTerm}"`);
      let videoUrl;
      
      if (searchTerm.startsWith('https://www.youtube.com') || searchTerm.startsWith('https://youtu.be')) {
        console.log('🎯 YouTube-Link erkannt');
        videoUrl = searchTerm;
      } else {
        return message.reply('Bitte gib einen direkten YouTube-Link ein.');
      }

      await playYouTube(videoUrl, channel, message);

    } catch (error) {
      console.error('❌ Fehler:', error);
      message.reply('Es gab einen Fehler beim Abspielen des Tracks.');
    }
  }

  if (command === 'leave') {
    const connection = getVoiceConnection(message.guild.id);
    if (connection) {
      connection.destroy();
      message.reply('Bot hat den Voice-Channel verlassen 👋');
    } else {
      message.reply('Bot ist in keinem Voice-Channel!');
    }
  }

  if (command === 'debug') {
    const connection = getVoiceConnection(message.guild.id);
    const debugInfo = {
      'Bot Voice Status': connection ? connection.state.status : 'Keine Verbindung',
      'Player Status': player.state.status,
      'Muted': isMuted,
      'Volume': volume,
      'Current Resource': player.state.resource ? 'Vorhanden' : 'Keine',
      'Voice Channel': message.member?.voice.channel ? message.member.voice.channel.name : 'Nicht im Channel'
    };
    
    console.log('Debug Info:', debugInfo);
    message.reply('Debug-Informationen wurden in der Konsole ausgegeben.');
  }
});

client.login(process.env.DISCORD_TOKEN);