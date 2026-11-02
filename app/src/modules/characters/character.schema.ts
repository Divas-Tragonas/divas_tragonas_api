import { z } from 'zod';

// The opaque sheet is capped so a single character stays far below Mongo's
// 16MB document limit and the default request body limit.
export const SHEET_MAX_BYTES = 512 * 1024;
// A portrait is a dataURL (the pixel-art ones are ~48px PNGs; a painted one
// may be a few hundred KB). Capped for the same reason as the sheet.
export const PORTRAIT_MAX_CHARS = 1024 * 1024;
export const XP_AMOUNT_MAX = 100_000;
export const XP_BATCH_MAX = 20;

const sheetSchema = z
  .record(z.unknown())
  .refine((s) => Buffer.byteLength(JSON.stringify(s), 'utf8') <= SHEET_MAX_BYTES, {
    message: `"sheet" exceeds ${SHEET_MAX_BYTES} bytes`,
  });

const text = (max: number) => z.string().trim().max(max);

// Every editable field, WITHOUT defaults: used as-is (partial) for PUT so an
// omitted field is left untouched instead of being reset.
const editableFields = {
  name: text(80).min(1),
  player: text(60),
  race: text(60),
  className: text(60),
  level: z.number().int().min(1).max(20),
  hpMax: z.number().int().min(1),
  ac: z.number().int().min(0),
  speed: z.number().int().min(0),
  passivePerception: z.number().int().min(0),
  portrait: z.string().max(PORTRAIT_MAX_CHARS),
  notionUrl: text(500),
  sheet: sheetSchema,
};

// xp and xpLog only move through the XP endpoints. Rejecting them (rather than
// silently stripping them) tells a caller that tried to set them directly.
const noXpFields = (body: unknown) =>
  typeof body !== 'object' || body === null || (!('xp' in body) && !('xpLog' in body));
const NO_XP_MESSAGE = '"xp" and "xpLog" can only be changed via POST /characters/:id/xp';
// Checked on the raw body first, then the body is parsed (and unknown keys
// stripped) by `schema`. A pipe — not `.and()`, whose merge would bring the
// stripped keys back.
const rejectingXp = <T extends z.ZodTypeAny>(schema: T) =>
  z.unknown().refine(noXpFields, { message: NO_XP_MESSAGE }).pipe(schema);

export const createCharacterSchema = rejectingXp(
  z.object({
    name: editableFields.name,
    player: editableFields.player.optional().default(''),
    race: editableFields.race.optional().default(''),
    className: editableFields.className.optional().default(''),
    level: editableFields.level.optional().default(1),
    hpMax: editableFields.hpMax.optional().default(1),
    ac: editableFields.ac.optional().default(10),
    speed: editableFields.speed.optional().default(30),
    passivePerception: editableFields.passivePerception.optional().default(10),
    portrait: editableFields.portrait.optional().default(''),
    notionUrl: editableFields.notionUrl.optional().default(''),
    sheet: editableFields.sheet.optional().default({}),
  }),
);

export const updateCharacterSchema = rejectingXp(
  z
    .object(editableFields)
    .partial()
    .refine((body) => Object.keys(body).length > 0, {
      message: 'At least one field must be provided',
    }),
);

const xpAmount = z
  .number()
  .int()
  .min(-XP_AMOUNT_MAX)
  .max(XP_AMOUNT_MAX)
  .refine((n) => n !== 0, { message: '"amount" must not be 0' });

const xpMeta = {
  reason: text(120).optional().default(''),
  source: text(60).optional().default(''),
  awardId: text(64).optional().default(''),
};

export const awardXpSchema = z.object({ amount: xpAmount, ...xpMeta });

export const awardXpBatchSchema = z
  .object({
    awards: z
      .array(z.object({ id: z.string().min(1), amount: xpAmount }))
      .min(1)
      .max(XP_BATCH_MAX),
    ...xpMeta,
  })
  .refine((body) => new Set(body.awards.map((a) => a.id)).size === body.awards.length, {
    message: 'Each character id may appear only once in "awards"',
  });

export type CreateCharacter = z.infer<typeof createCharacterSchema>;
export type UpdateCharacter = z.infer<typeof updateCharacterSchema>;
export type AwardXp = z.infer<typeof awardXpSchema>;
export type AwardXpBatch = z.infer<typeof awardXpBatchSchema>;

export interface XpLogEntry {
  amount: number;
  reason: string;
  source: string;
  awardId: string;
  at: Date;
}

export interface CharacterSummary {
  id: string;
  name: string;
  player: string;
  race: string;
  className: string;
  level: number;
  xp: number;
  hpMax: number;
  ac: number;
  speed: number;
  passivePerception: number;
  portrait: string;
  notionUrl: string;
  sheet: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Character extends CharacterSummary {
  xpLog: XpLogEntry[];
}
