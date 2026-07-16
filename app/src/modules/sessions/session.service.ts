import mongoose from 'mongoose';
import { SessionModel } from './session.model';
import type { CreateSession, UpdateSession, Session, SessionMeta } from './session.schema';

type SessionDoc = InstanceType<typeof SessionModel>;
type ObjectId = mongoose.Types.ObjectId;

// The `data` blob is stored in GridFS rather than inline, so a single session
// can exceed the 16MB BSON document limit (base64 backgrounds, PSD layers,
// video). Each session's blob is one GridFS file referenced by `dataFileId`.
function getBucket(): mongoose.mongo.GridFSBucket {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('MongoDB connection is not ready');
  }
  return new mongoose.mongo.GridFSBucket(db, { bucketName: 'session_data' });
}

// Serialize the blob to JSON, store it in GridFS, and report its byte size.
async function writeData(data: unknown): Promise<{ fileId: ObjectId; sizeBytes: number }> {
  const buffer = Buffer.from(JSON.stringify(data), 'utf8');
  const sizeBytes = buffer.byteLength;
  const uploadStream = getBucket().openUploadStream('session-data');
  const fileId = uploadStream.id;

  await new Promise<void>((resolve, reject) => {
    uploadStream.on('error', reject);
    uploadStream.on('finish', () => resolve());
    uploadStream.end(buffer);
  });

  return { fileId, sizeBytes };
}

async function readData(fileId: ObjectId): Promise<unknown> {
  const chunks: Buffer[] = [];
  const downloadStream = getBucket().openDownloadStream(fileId);

  await new Promise<void>((resolve, reject) => {
    downloadStream.on('data', (chunk: Buffer) => chunks.push(chunk));
    downloadStream.on('error', reject);
    downloadStream.on('end', () => resolve());
  });

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function removeData(fileId: ObjectId): Promise<void> {
  try {
    await getBucket().delete(fileId);
  } catch {
    // The blob may already be gone; deleting the metadata is what matters.
  }
}

function toMeta(doc: SessionDoc): SessionMeta {
  const json = doc.toJSON() as unknown as SessionMeta;
  return {
    id: json.id,
    name: json.name,
    createdAt: json.createdAt,
    updatedAt: json.updatedAt,
    sizeBytes: json.sizeBytes,
  };
}

export async function getAllSessions(): Promise<SessionMeta[]> {
  const docs = await SessionModel.find().sort({ updatedAt: -1 });
  return docs.map(toMeta);
}

export async function getSessionById(id: string): Promise<Session | null> {
  if (!mongoose.isValidObjectId(id)) {
    return null;
  }
  const doc = await SessionModel.findById(id);
  if (!doc) {
    return null;
  }
  const data = await readData(doc.dataFileId);
  return { ...toMeta(doc), data };
}

export async function createSession(input: CreateSession): Promise<Session> {
  const { fileId, sizeBytes } = await writeData(input.data);
  const doc = await SessionModel.create({ name: input.name, dataFileId: fileId, sizeBytes });
  return { ...toMeta(doc), data: input.data };
}

export async function updateSession(id: string, input: UpdateSession): Promise<Session | null> {
  if (!mongoose.isValidObjectId(id)) {
    return null;
  }
  const doc = await SessionModel.findById(id);
  if (!doc) {
    return null;
  }

  let staleFileId: ObjectId | null = null;
  let data: unknown;

  if (input.data !== undefined) {
    const { fileId, sizeBytes } = await writeData(input.data);
    staleFileId = doc.dataFileId;
    doc.dataFileId = fileId;
    doc.sizeBytes = sizeBytes;
    data = input.data;
  }
  if (input.name !== undefined) {
    doc.name = input.name;
  }

  await doc.save();

  // Drop the previous blob only after the new reference is safely persisted.
  if (staleFileId) {
    await removeData(staleFileId);
  }
  if (data === undefined) {
    data = await readData(doc.dataFileId);
  }

  return { ...toMeta(doc), data };
}

export async function deleteSession(id: string): Promise<boolean> {
  if (!mongoose.isValidObjectId(id)) {
    return false;
  }
  const doc = await SessionModel.findByIdAndDelete(id);
  if (!doc) {
    return false;
  }
  await removeData(doc.dataFileId);
  return true;
}
