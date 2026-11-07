import { Schema, model } from 'mongoose';
import { DAMAGE_TYPES } from './damage-types';

const damageTypeList = { type: [{ type: String, enum: DAMAGE_TYPES }], default: [] };

const enemySchema = new Schema(
  {
    name: { type: String, required: true },
    color: { type: String, required: true },
    hpMax: { type: Number, required: true },
    R: { type: Number, required: true },
    sm: { type: Number, required: true },
    imageData: { type: String },
    // Free-text grouping for the back office; '' means "no project/category".
    // Mongoose applies the default when hydrating older documents too.
    project: { type: String, default: '' },
    category: { type: String, default: '' },
    // XP granted when the enemy is defeated. 0 on documents saved before it existed.
    xp: { type: Number, default: 0 },
    // Melee reach in feet. Defaults to 5 for documents saved before it existed.
    reachFt: { type: Number, default: 5 },
    resistances: damageTypeList,
    vulnerabilities: damageTypeList,
    immunities: damageTypeList,
    // Types the enemy resists only when the attack is NOT magical.
    nonMagicResistances: damageTypeList,
  },
  {
    versionKey: false,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = (ret._id as { toString(): string }).toString();
        delete ret._id;
      },
    },
  },
);

export const EnemyModel = model('Enemy', enemySchema);
