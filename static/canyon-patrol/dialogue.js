export function createDialogue(lines, state) {
  const recordings = Object.fromEntries(Object.keys(lines).map(id => {
    const clip = new Audio(new URL(id + '.mp3', import.meta.url));
    clip.preload = 'none';
    return [id, clip];
  }));
  let recording;
  const subtitles = document.getElementById('subtitles');
  const subtitleSpeaker = document.getElementById('subtitleSpeaker');
  const subtitleLine = document.getElementById('subtitleLine');
  let fallbackUntil = 0;
  let playbackFailed = false;
  function showTextFallback(clip) {
    if (clip !== recording || playbackFailed) return;
    playbackFailed = true;
    fallbackUntil = state.time + (clip.duration || 5);
    subtitles.hidden = state.mode !== 'playing';
  }
  function playLine() {
    const clip = recording;
    clip.play().catch(error => {
      if (error.name !== 'AbortError') showTextFallback(clip);
    });
  }
  for (const clip of Object.values(recordings)) {
    clip.addEventListener('error', () => showTextFallback(clip));
    clip.addEventListener('playing', () => {
      if (clip !== recording) return;
      fallbackUntil = 0;
      subtitles.hidden = state.mode !== 'playing';
    });
    for (const event of ['pause', 'waiting', 'ended']) {
      clip.addEventListener(event, () => {
        if (clip === recording) subtitles.hidden = true;
      });
    }
  }
  function say(id) {
    recording?.pause();
    subtitles.hidden = true;
    fallbackUntil = 0;
    subtitleSpeaker.textContent = lines[id].speaker;
    subtitleLine.textContent = lines[id].script.replace(/\[[^\]]*\]\s*/g, '');
    playbackFailed = false;
    recording = recordings[id];
    recording.currentTime = 0;
    recording.muted = state.muted;
    playLine();
  }
  function lineFinished() {
    return playbackFailed ? state.time >= fallbackUntil : recording.ended;
  }
  function tick(){
    if (fallbackUntil && state.time >= fallbackUntil) {
      subtitles.hidden = true;
      fallbackUntil = 0;
    }
  }
  return {say,lineFinished,tick,
    mute(value){if (recording) recording.muted = value;},
    pause(value) {
      if (value) {
        subtitles.hidden = true;
        recording?.pause();
      } else if (fallbackUntil > state.time) {
        subtitles.hidden = false;
      } else if (recording && !playbackFailed && !recording.ended && !recording.error) {
        playLine();
      }
    }
  };
}
