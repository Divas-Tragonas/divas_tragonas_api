import { EnemyModel } from './enemy.model';
import type { CreateEnemy, UpdateEnemy, Enemy } from './enemy.schema';

function toEnemy(doc: InstanceType<typeof EnemyModel>): Enemy {
  return doc.toJSON() as Enemy;
}

export async function getAllEnemies(): Promise<Enemy[]> {
  const docs = await EnemyModel.find();
  return docs.map(toEnemy);
}

export async function createEnemy(data: CreateEnemy): Promise<Enemy> {
  const doc = await EnemyModel.create(data);
  return toEnemy(doc);
}

export async function updateEnemy(id: string, data: UpdateEnemy): Promise<Enemy | null> {
  const doc = await EnemyModel.findByIdAndUpdate(id, data, { new: true });
  return doc ? toEnemy(doc) : null;
}

export async function deleteEnemy(id: string): Promise<boolean> {
  const result = await EnemyModel.findByIdAndDelete(id);
  return result !== null;
}
