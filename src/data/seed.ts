/* Default beginner vocabulary — roughly a primary class, 2nd year of English.
 * German nouns carry their article (der/die/das); the trainer treats a
 * missing article as a small deviation, not a wrong answer. */
export const DEFAULT_VOCAB = [
  // Animals
  { en: "dog",        de: "der Hund",        topic: "Animals" },
  { en: "cat",        de: "die Katze",       topic: "Animals" },
  { en: "bird",       de: "der Vogel",       topic: "Animals" },
  { en: "horse",      de: "das Pferd",       topic: "Animals" },
  { en: "fish",       de: "der Fisch",       topic: "Animals" },
  { en: "rabbit",     de: "das Kaninchen",   topic: "Animals" },
  { en: "mouse",      de: "die Maus",        topic: "Animals" },
  { en: "cow",        de: "die Kuh",         topic: "Animals" },

  // Colours
  { en: "red",        de: "rot",             topic: "Colours" },
  { en: "blue",       de: "blau",            topic: "Colours" },
  { en: "green",      de: "grün",            topic: "Colours" },
  { en: "yellow",     de: "gelb",            topic: "Colours" },
  { en: "black",      de: "schwarz",         topic: "Colours" },
  { en: "white",      de: "weiss",           topic: "Colours" },

  // Numbers
  { en: "one",        de: "eins",            topic: "Numbers" },
  { en: "two",        de: "zwei",            topic: "Numbers" },
  { en: "three",      de: "drei",            topic: "Numbers" },
  { en: "ten",        de: "zehn",            topic: "Numbers" },

  // Family
  { en: "mother",     de: "die Mutter",      topic: "Family" },
  { en: "father",     de: "der Vater",       topic: "Family" },
  { en: "sister",     de: "die Schwester",   topic: "Family" },
  { en: "brother",    de: "der Bruder",      topic: "Family" },
  { en: "family",     de: "die Familie",     topic: "Family" },
  { en: "grandmother",de: "die Grossmutter", topic: "Family" },

  // School
  { en: "school",     de: "die Schule",      topic: "School" },
  { en: "teacher",    de: "der Lehrer",      topic: "School" },
  { en: "book",       de: "das Buch",        topic: "School" },
  { en: "pen",        de: "der Stift",       topic: "School" },
  { en: "pencil",     de: "der Bleistift",   topic: "School" },
  { en: "desk",       de: "der Schreibtisch",topic: "School" },
  { en: "chair",      de: "der Stuhl",       topic: "School" },

  // Food
  { en: "apple",      de: "der Apfel",       topic: "Food" },
  { en: "bread",      de: "das Brot",        topic: "Food" },
  { en: "milk",       de: "die Milch",       topic: "Food" },
  { en: "water",      de: "das Wasser",      topic: "Food" },
  { en: "egg",        de: "das Ei",          topic: "Food" },
  { en: "cheese",     de: "der Käse",        topic: "Food" },

  // Body
  { en: "hand",       de: "die Hand",        topic: "Body" },
  { en: "head",       de: "der Kopf",        topic: "Body" },
  { en: "eye",        de: "das Auge",        topic: "Body" },
  { en: "foot",       de: "der Fuss",        topic: "Body" },

  // Home
  { en: "house",      de: "das Haus",        topic: "Home" },
  { en: "door",       de: "die Tür",         topic: "Home" },
  { en: "window",     de: "das Fenster",     topic: "Home" },
  { en: "table",      de: "der Tisch",       topic: "Home" },

  // Time
  { en: "day",        de: "der Tag",         topic: "Time" },
  { en: "night",      de: "die Nacht",       topic: "Time" },
  { en: "today",      de: "heute",           topic: "Time" },
  { en: "Monday",     de: "Montag",          topic: "Time" },

  // Words & actions
  { en: "big",        de: "gross",           topic: "Words" },
  { en: "small",      de: "klein",           topic: "Words" },
  { en: "good",       de: "gut",             topic: "Words" },
  { en: "happy",      de: "glücklich",       topic: "Words" },
  { en: "to go",      de: "gehen",           topic: "Words" },
  { en: "to eat",     de: "essen",           topic: "Words" },
  { en: "to play",    de: "spielen",         topic: "Words" },
  { en: "to read",    de: "lesen",           topic: "Words" },
];

/* A small bundled dictionary used as an offline fallback for auto-fill
 * when the online translator is unavailable. Built from the list above. */
export const BUNDLED_DICT = (function () {
  const en2de: Record<string, string> = {};
  const de2en: Record<string, string> = {};
  for (const w of DEFAULT_VOCAB) {
    en2de[w.en.toLowerCase()] = w.de;
    de2en[w.de.toLowerCase().replace(/^(der|die|das)\s+/, "")] = w.en;
  }
  return { en2de, de2en };
})();
