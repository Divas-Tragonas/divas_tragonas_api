import { z } from 'zod';
import { DAMAGE_TYPES } from './damage-types';
import { CONDITION_IDS, CR_VALUES } from './condition-ids';

const damageTypeEnum = z.enum(DAMAGE_TYPES);
const conditionEnum = z.enum(CONDITION_IDS);
const crEnum = z.enum(['', ...CR_VALUES]);

const int = (min: number, max: number) => z.number().int().min(min).max(max);
const abilityScore = int(1, 30);
const saveBonus = int(-5, 20);

const abilitiesSchema = z.object({
  str: abilityScore,
  dex: abilityScore,
  con: abilityScore,
  int: abilityScore,
  wis: abilityScore,
  cha: abilityScore,
});

const savesSchema = z.object({
  str: saveBonus.optional(),
  dex: saveBonus.optional(),
  con: saveBonus.optional(),
  int: saveBonus.optional(),
  wis: saveBonus.optional(),
  cha: saveBonus.optional(),
});

const attackSchema = z.object({
  name: z.string().min(1).max(80),
  kind: z.enum(['melee', 'ranged', 'thrown']),
  reachFt: int(0, 300).optional(),
  rangeFt: int(0, 2000).optional(),
  longFt: int(0, 2000).optional(),
  bonus: z.string().max(10).optional(),
  damage: z.string().max(40).optional(),
  damageType: damageTypeEnum.optional(),
});

export const enemySchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  hpMax: z.number().int().min(1),
  R: z.number().int().min(8).max(200),
  sm: z.number().min(0.1).max(5.0),
  imageData: z.string().optional(),
  project: z.string().trim().max(60).optional().default(''),
  category: z.string().trim().max(60).optional().default(''),
  xp: z.number().int().min(0).optional().default(0),
  reachFt: z.number().int().min(0).max(300).optional().default(5),
  resistances: z.array(damageTypeEnum).optional().default([]),
  vulnerabilities: z.array(damageTypeEnum).optional().default([]),
  immunities: z.array(damageTypeEnum).optional().default([]),
  nonMagicResistances: z.array(damageTypeEnum).optional().default([]),
  cr: crEnum.optional().default(''),
  ac: int(0, 40).optional(),
  speedFt: int(0, 200).optional(),
  move: z.string().max(80).optional(),
  abilities: abilitiesSchema.optional(),
  saves: savesSchema.optional(),
  nonMagicImmunities: z.array(damageTypeEnum).optional().default([]),
  conditionImmunities: z.array(conditionEnum).optional().default([]),
  attacks: z.array(attackSchema).optional().default([]),
  traits: z.array(z.string().max(300)).optional().default([]),
});

export const createEnemySchema = enemySchema.omit({ id: true });

// No defaults on update: a PUT that omits project/category/xp must leave them
// untouched instead of resetting them to ''/0.
export const updateEnemySchema = createEnemySchema.partial().extend({
  project: z.string().trim().max(60).optional(),
  category: z.string().trim().max(60).optional(),
  xp: z.number().int().min(0).optional(),
  reachFt: z.number().int().min(0).max(300).optional(),
  resistances: z.array(damageTypeEnum).optional(),
  vulnerabilities: z.array(damageTypeEnum).optional(),
  immunities: z.array(damageTypeEnum).optional(),
  nonMagicResistances: z.array(damageTypeEnum).optional(),
  cr: crEnum.optional(),
  nonMagicImmunities: z.array(damageTypeEnum).optional(),
  conditionImmunities: z.array(conditionEnum).optional(),
  attacks: z.array(attackSchema).optional(),
  traits: z.array(z.string().max(300)).optional(),
});

export type Enemy = z.infer<typeof enemySchema>;
export type CreateEnemy = z.infer<typeof createEnemySchema>;
export type UpdateEnemy = z.infer<typeof updateEnemySchema>;
