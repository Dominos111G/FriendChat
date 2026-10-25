 function Join(){
    const joinSound = new Audio('https://www.soundjay.com/nature_c2026/sounds/river-4.mp3');
    joinSound.play().catch(error => {
        console.error('Error playing join sound:', error);
    });
}

