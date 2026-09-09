export function sequenceAtTime(segments, seconds) {
  let end = 0;
  for (const segment of segments) {
    end += segment.durationMs / 1000;
    if (seconds < end) return segment.sequence;
  }
  return segments.length;
}
