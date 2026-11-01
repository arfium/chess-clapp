# Board sounds

How `public/sounds/*.mp3` were made, so they can be remade (or a sound replaced) the
same way. Python 3 + numpy + ffmpeg.

1. **Reference.** Download lichess's `public/sound/standard/{Move,Capture,GenericNotify,Error}.mp3`
   into `ref/`. They are measured, never shipped (lila lists them as non-free).
2. **Candidates.** CC0 recordings from Freesound (HQ previews). `feat.py` measures a sound:
   length above −40 dB, attack, decay to −20 dB, spectral centroid, low/high balance,
   transients. The hits closest to each reference were chosen by that distance — see
   THIRD_PARTY_NOTICES for the four that won.
3. **Cut.** `make_sounds.py <tools> <work> <out>` cuts each hit to the reference's file
   length with the same onset, adds the notify sound's second strike at the reference's
   measured offset (295 ms, −20 dB), and levels to the reference's RMS.
4. **Conform.** `conform.py <tools> <work> <out>` applies a third-octave match EQ toward
   the reference (±9 dB), transplants the reference's amplitude envelope onto the
   percussive sounds, and writes `final-*.mp3`.
