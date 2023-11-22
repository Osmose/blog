const songInfo = document.querySelector('#songInfo').dataset.songInfo;
const song = JSON.parse(songInfo);

Amplitude.init({
  "bindings": {
    37: 'prev',
    39: 'next',
    32: 'play_pause'
  },
  "songs": [song],
  "volume": 100,
});

document.querySelector('.amplitude-song-played-progress').addEventListener('click', (event) => {
  const offset = event.target.getBoundingClientRect();
  const x = event.pageX - offset.left;

  Amplitude.setSongPlayedPercentage((x / offset.width) * 100);
});
