import mongoose, { Schema, Types } from "mongoose";

export interface IRefreshToken extends mongoose.Document {
  tokenHash: string;
  userId: Types.ObjectId;
  familyId: string;
  expiresAt: Date;
  issuedAt: Date;
  usedAt?: Date;
  revokedAt?: Date;
  replacedByHash?: string;
}

const RefreshTokenSchema = new Schema<IRefreshToken>(
  {
    tokenHash: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    familyId: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    issuedAt: { type: Date, required: true, default: Date.now },
    usedAt: Date,
    revokedAt: Date,
    replacedByHash: String
  },
  { timestamps: true }
);

RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshTokenModel = mongoose.model<IRefreshToken>(
  "RefreshToken",
  RefreshTokenSchema
);
