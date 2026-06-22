import type { Settings } from "./types";

/* Research-backed default settings. Each is surfaced in the Settings
 * tab and labelled "Recommended" (best practice from learning psychology). */
export const RECOMMENDED: Partial<Settings> = {
  mode: "type",          // active recall (typing) beats recognition
  choicesCount: 4,        // multiple-choice options when in Choose mode
  autoAudio: false,       // auto-play pronunciation each card
  dailyGoal: 30,          // cards/day target (~15 min daily session)
  newPerDay: 10,          // new words introduced per day (8–12 is ideal)
  lernIntensity: "normal", // V8: FSRS retention target (locker/normal/intensiv = 85/90/95%)
  masteryCorrect: 3,      // internal default for classifyWord display (sliders removed in V8)
  lenientCase: true,      // ignore upper/lower case
  strictAccents: false,   // umlaut/accent slips = small mistake, not wrong
  articleMode: "required-partial", // missing der/die/das = small deduction
  acceptPartial: true,    // award partial credit for near-misses
  latinMode: "L2",        // Latin: ask the Grundform, show the full Lernform
  tipsFrequency: "occasional", // sporadic study tips at natural pauses
  skin: "paper",          // appearance: warm paper (today's look)
  cardStyle: "ruled",     // lined card + red margin (today's look)
  cardFont: "serif",      // card text font (today's look)
};
