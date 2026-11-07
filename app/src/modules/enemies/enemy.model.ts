import { Schema, model } from 'mongoose';
import { DAMAGE_TYPES } from './damage-types';
import { CONDITION_IDS, CR_VALUES } from './condition-ids';

const damageTypeList = { type: [{ type: String, enum: DAMAGE_TYPES }], default: [] };

const intField = (min: number, max: number) => ({
  type: Number,
  min,
  max,
  validate: Number.isInteger,
});

const attackSchema = new Schema(
  {
    name: { type: String, required: true, minlength: 1, maxlength: 80 },
    kind: { type: String, required: true, enum: ['melee', 'ranged', 'thrown'] },
    reachFt: intField(0, 300),
    rangeFt: intField(0, 2000),
    longFt: intField(0, 2000),
    bonus: { type: String, maxlength: 10 },
    damage: { type: String, maxlength: 40 },
    damageType: { type: String, enum: DAMAGE_TYPES },
  },
  { _id: false },
);

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
    // 5e stat block. Challenge rating ('' = unset).
    cr: { type: String, enum: ['', ...CR_VALUES], default: '' },
    ac: intField(0, 40),
    speedFt: intField(0, 200),
    move: { type: String, maxlength: 80 },
    abilities: {
      str: intField(1, 30),
      dex: intField(1, 30),
      con: intField(1, 30),
      int: intField(1, 30),
      wis: intField(1, 30),
      cha: intField(1, 30),
    },
    saves: {
      str: intField(-5, 20),
      dex: intField(-5, 20),
      con: intField(-5, 20),
      int: intField(-5, 20),
      wis: intField(-5, 20),
      cha: intField(-5, 20),
    },
    // Immune to damage from non-magical attacks of these types.
    nonMagicImmunities: damageTypeList,
    conditionImmunities: { type: [{ type: String, enum: CONDITION_IDS }], default: [] },
    attacks: { type: [attackSchema], default: [] },
    traits: { type: [{ type: String, maxlength: 300 }], default: [] },
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
