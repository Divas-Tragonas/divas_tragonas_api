// D&D 5e conditions an enemy can be immune to.
export const CONDITION_IDS = [
  'blinded',
  'charmed',
  'deafened',
  'exhaustion',
  'frightened',
  'grappled',
  'incapacitated',
  'invisible',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
] as const;

export type ConditionId = (typeof CONDITION_IDS)[number];

// Challenge rating values; '' means "not set".
export const CR_VALUES = [
  '0',
  '1/8',
  '1/4',
  '1/2',
  ...Array.from({ length: 30 }, (_, i) => String(i + 1)),
] as const;
