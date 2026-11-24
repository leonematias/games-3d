// Review-only named events anchor synthesized cues to the recording timeline.
export function reviewSounds(sounds) {
  const review = window.__narrativeAudio;
  if (!review) return sounds;
  const controls = new Set(['unlock','setMuted']);
  return Object.fromEntries(Object.entries(sounds).map(([key,play])=>[key,(...args)=>{
    const result = play(...args);
    if (!controls.has(key)) review.event('effect',key);
    return result;
  }]));
}
