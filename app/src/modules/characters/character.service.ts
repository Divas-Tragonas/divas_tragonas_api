import mongoose from 'mongoose';
import { CharacterModel, XP_LOG_MAX } from './character.model';
import type {
  AwardXp,
  AwardXpBatch,
  Character,
  CharacterSummary,
  CreateCharacter,
  UpdateCharacter,
} from './character.schema';

type CharacterDoc = InstanceType<typeof CharacterModel>;

function toCharacter(doc: CharacterDoc): Character {
  return doc.toJSON() as unknown as Character;
}

function toSummary(doc: CharacterDoc): CharacterSummary {
  // The list never carries the log (it can be 200 entries per character).
  const json = doc.toJSON() as unknown as Partial<Character>;
  delete json.xpLog;
  return json as CharacterSummary;
}

function toObjectId(id: string): mongoose.Types.ObjectId | null {
  return mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : null;
}

export async function getAllCharacters(): Promise<CharacterSummary[]> {
  const docs = await CharacterModel.find().select('-xpLog').sort({ name: 1 });
  return docs.map(toSummary);
}

export async function getCharacterById(id: string): Promise<Character | null> {
  const _id = toObjectId(id);
  if (!_id) return null;
  const doc = await CharacterModel.findById(_id);
  return doc ? toCharacter(doc) : null;
}

export async function createCharacter(data: CreateCharacter): Promise<Character> {
  const doc = await CharacterModel.create(data);
  return toCharacter(doc);
}

export async function updateCharacter(
  id: string,
  data: UpdateCharacter,
): Promise<Character | null> {
  const _id = toObjectId(id);
  if (!_id) return null;
  const doc = await CharacterModel.findByIdAndUpdate(_id, { $set: data }, { new: true });
  return doc ? toCharacter(doc) : null;
}

export async function deleteCharacter(id: string): Promise<boolean> {
  const _id = toObjectId(id);
  if (!_id) return false;
  const result = await CharacterModel.findByIdAndDelete(_id);
  return result !== null;
}

// ---------------------------------------------------------------------------
// Experience
//
// An award is ONE single-document update (an aggregation pipeline), so it is
// atomic: concurrent awards never lose each other. A plain `$inc` cannot clamp,
// and xp must never go below 0, so the pipeline computes
// `xp = max(0, xp + amount)` and logs the amount actually applied (a -500 on a
// character with 200 xp logs -200), so the log always adds up to `xp`.
//
// Idempotency: when an `awardId` is given, the update only matches if that id
// is not in the log yet; a retried request therefore matches nothing and the
// character is returned unchanged. Only the newest XP_LOG_MAX entries are
// kept, so the guard covers the last XP_LOG_MAX awards of each character.
// ---------------------------------------------------------------------------

interface XpMeta {
  reason: string;
  source: string;
  awardId: string;
}

function xpFilter(_id: mongoose.Types.ObjectId, awardId: string) {
  return awardId ? { _id, 'xpLog.awardId': { $ne: awardId } } : { _id };
}

function xpUpdate(amount: number, meta: XpMeta) {
  const current = { $ifNull: ['$xp', 0] };
  const next = { $max: [0, { $add: [current, amount] }] };
  const entry = {
    amount: { $subtract: [next, current] },
    // $literal: user text starting with "$" must not be read as a field path.
    reason: { $literal: meta.reason },
    source: { $literal: meta.source },
    awardId: { $literal: meta.awardId },
    at: '$$NOW',
  };
  return [
    {
      $set: {
        xp: next,
        xpLog: {
          $slice: [{ $concatArrays: [{ $ifNull: ['$xpLog', []] }, [entry]] }, -XP_LOG_MAX],
        },
        updatedAt: '$$NOW',
      },
    },
  ];
}

export async function awardXp(id: string, input: AwardXp): Promise<Character | null> {
  const _id = toObjectId(id);
  if (!_id) return null;
  const raw = await CharacterModel.collection.findOneAndUpdate(
    xpFilter(_id, input.awardId),
    xpUpdate(input.amount, input),
    { returnDocument: 'after' },
  );
  if (raw) return toCharacter(CharacterModel.hydrate(raw));
  // No match: either the character does not exist, or this awardId was already
  // applied (a retry) and the character is returned as it is.
  return getCharacterById(id);
}

export type AwardXpBatchResult =
  | { ok: true; characters: Character[] }
  | { ok: false; missing: string };

export async function awardXpBatch(input: AwardXpBatch): Promise<AwardXpBatchResult> {
  const ids: mongoose.Types.ObjectId[] = [];
  for (const award of input.awards) {
    const _id = toObjectId(award.id);
    if (!_id) return { ok: false, missing: award.id };
    ids.push(_id);
  }

  // All or nothing on unknown ids: check them all before touching any.
  const found = await CharacterModel.find({ _id: { $in: ids } })
    .select('_id')
    .lean();
  const foundIds = new Set(found.map((d) => d._id.toString()));
  const missing = input.awards.find((a) => !foundIds.has(a.id));
  if (missing) return { ok: false, missing: missing.id };

  await CharacterModel.collection.bulkWrite(
    input.awards.map((award, i) => ({
      updateOne: {
        filter: xpFilter(ids[i], input.awardId),
        update: xpUpdate(award.amount, input),
      },
    })),
    { ordered: false },
  );

  const docs = await CharacterModel.find({ _id: { $in: ids } });
  const byId = new Map(docs.map((d) => [d._id.toString(), toCharacter(d)]));
  // Same order as the request. A character deleted between the check and the
  // write is simply left out.
  const characters = input.awards
    .map((a) => byId.get(a.id))
    .filter((c): c is Character => c !== undefined);
  return { ok: true, characters };
}
