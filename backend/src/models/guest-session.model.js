import mongoose from 'mongoose';

const guestSessionSchema = new mongoose.Schema(
  {
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      select: false,
    },
    shop: {
      type: String,
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      expires: 0,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'tbl_guest_sessions',
  },
);

const GuestSession =
  mongoose.models.tbl_GuestSession ||
  mongoose.model('tbl_GuestSession', guestSessionSchema);

export default GuestSession;
