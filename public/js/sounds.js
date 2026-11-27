function playSound(soundName){
    let sound;
    try {
        sound = new Audio(`../sounds/${soundName}.mp3`);
        sound.play().catch((error) => {
            console.error(`Error playing ${soundName} sound:`, error);
        });
    } catch (err) {
        console.error(`Error loading ${soundName} sound:`, err);
    }
}