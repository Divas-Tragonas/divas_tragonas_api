import { Schema, model } from 'mongoose';

// A saved game session. The full game state (`data`) is an opaque BLOB that the
// frontend evolves without touching the API, so we never validate its inner
// structure. Because that blob carries base64 images (and can exceed Mongo's
// 16MB BSON document limit, e.g. with a video background), it is NOT stored
// inline in this document — it lives in GridFS and is referenced by
// `dataFileId`. This document keeps only the lightweight metadata, which is all
// the `SessionMeta` list endpoint needs. `sizeBytes` is precomputed at write
// time (byte length of JSON.stringify(data)) so listing never touches GridFS.
const sessionSchema = new Schema(
  {
    name: { type: String, required: true },
    dataFileId: { type: Schema.Types.ObjectId, required: true },
    sizeBytes: { type: Number, required: true },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = (ret._id as { toString(): string }).toString();
        delete ret._id;
        // dataFileId is an internal storage pointer, never exposed to clients.
        delete ret.dataFileId;
      },
    },
  },
);

export const SessionModel = model('Session', sessionSchema);
