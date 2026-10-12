
/* ==========================================================================
   DASHAIN 2083 — EDIT THIS FILE TO CHANGE MUSIC, THE DEITY IMAGE AND DEFAULTS
   No build step. Save the file, refresh the page.
   ========================================================================== */

window.DASHAIN_CONFIG = {

  /* ---------------------------------------------------------------------
     MUSIC
     Put your licensed track anywhere inside the project and point `src`
     at it. mp3, m4a/aac, ogg and wav all work in modern browsers.

       src:       path relative to index.html (or a full https:// URL)
       volume:    0 (silent) … 1 (full). Visitors can still change it.
       startTime: where the selected music section begins, in seconds.
       endTime:   where the selected music section ends, in seconds.
       loop:      true = repeat the selected section forever.

     To swap the song: drop a new file into assets/audio/ and change `src`.
     Set src to "" to turn music off completely (the sound button hides).

     The music starts only after the visitor taps the reveal button.
     If the file is missing the site keeps working silently.
     --------------------------------------------------------------------- */
  music: {
    src: "music.mp3",
    volume: 0.6,
    startTime: 27,
    endTime: 70,
    loop: true
  },

  /* ---------------------------------------------------------------------
     DURGA MATA IMAGE
     Recommended: a transparent-background WebP/PNG, portrait, ~1200px tall.
     (A photo with its own background also works; the bottom edge is
     feathered into the clouds.)

       src:     image path. If the file is missing, a lotus-mandala emblem
                is shown instead so the page is never broken.
       alt:     description read by screen readers
       aspect:  width ÷ height of the image (0.75 = 3:4 portrait)
       haloY:   where the golden halo sits, as a fraction of the image
                height from the top (0.40 ≈ around the goddess's head)
     --------------------------------------------------------------------- */
  deity: {
    src: "durga.png",
    alt: "Goddess Durga Mata with traditional devotional iconography, in golden light",
    aspect: 0.85,
    haloY: 0.40
  },

  /* ---------------------------------------------------------------------
     DEFAULT NAMES (used only when the link has no ?from= / ?to=)
     Leave empty for a generic greeting.
     --------------------------------------------------------------------- */
  defaults: {
    from: "",
    to: ""
  }
};
