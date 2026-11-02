import { Schema, model } from 'mongoose';

// Only the newest entries are kept, so a long campaign cannot grow a character
// document without bound (newest at the end).
export const XP_LOG_MAX = 200;

const xpLogEntrySchema = new Schema(
  {
    amount: { type: Number, required: true },
    reason: { type: String, default: '' },
    source: { type: String, default: '' },
    awardId: { type: String, default: '' },
    at: { type: Date, required: true },
  },
  { _id: false },
);

// A campaign character sheet. The few fields the map viewer reads directly
// (level, xp, hpMax, ac, speed...) are typed columns; everything else on the
// sheet (abilities, saves, skills, attacks, spells, gear, traits, background)
// lives in `sheet`, an OPAQUE object the frontend owns — like Session.data, the
// API never inspects its inner shape.
//
// `xp` and `xpLog` are only ever written by the XP endpoints
// (POST /characters/:id/xp and POST /characters/xp), never by POST/PUT.
const characterSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    player: { type: String, default: '' },
    race: { type: String, default: '' },
    className: { type: String, default: '' },
    level: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },
    hpMax: { type: Number, default: 1 },
    ac: { type: Number, default: 10 },
    speed: { type: Number, default: 30 },
    passivePerception: { type: Number, default: 10 },
    portrait: { type: String, default: '' },
    notionUrl: { type: String, default: '' },
    sheet: { type: Schema.Types.Mixed, default: () => ({}) },
    xpLog: { type: [xpLogEntrySchema], default: () => [] },
  },
  {
    timestamps: true,
    versionKey: false,
    // Keep `sheet: {}` (and empty nested objects inside it) instead of letting
    // Mongoose strip them on save: the frontend expects the key to be there.
    minimize: false,
    toJSON: {
      minimize: false,
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = (ret._id as { toString(): string }).toString();
        delete ret._id;
      },
    },
  },
);

export const CharacterModel = model('Character', characterSchema);
