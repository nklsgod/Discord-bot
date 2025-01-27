const play = require('play-dl');

(async () => {
    console.log('Starte YouTube-Authentifizierung...');
    
    try {
        await play.setToken({
            useragent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.71 Safari/537.36',
            cookie: 'YOUR_YOUTUBE_COOKIE'  // Hier müssen wir deinen YouTube-Cookie einfügen
        });
        
        console.log('Token gesetzt!');
        
        // Test ob es funktioniert
        const video = await play.video_info('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
        console.log('Test erfolgreich:', video.video_details.title);
        
    } catch (error) {
        console.error('Fehler beim Setup:', error);
    }
})(); 