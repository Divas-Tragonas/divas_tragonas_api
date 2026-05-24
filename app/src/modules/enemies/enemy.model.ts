import { Schema, model } from 'mongoose';

const enemySchema = new Schema(
  {
    name: { type: String, required: true },
    color: { type: String, required: true },
    hpMax: { type: Number, required: true },
    R: { type: Number, required: true },
    sm: { type: Number, required: true },
    imageData: { type: String },
  },
  {
    versionKey: false,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
      },
    },
  },
);

export const EnemyModel = model('Enemy', enemySchema);
