import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

export const LEDGER_ACCOUNTS = ['pending', 'available', 'reserved'] as const;
export const LEDGER_ENTRY_TYPES = [
  'sale_credit',
  'commission_debit',
  'settlement_release',
  'refund_debit',
  'adjustment_credit',
  'adjustment_debit',
  'withdrawal_debit',
  'withdrawal_reversal',
] as const;

const ledgerEntrySchema = new Schema(
  {
    vendorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    vendorOrderId: { type: Schema.Types.ObjectId, ref: 'VendorOrder', default: null },
    parentOrderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
    type: { type: String, required: true, enum: LEDGER_ENTRY_TYPES },
    amount: { type: Number, required: true, min: 0 },
    account: { type: String, required: true, enum: LEDGER_ACCOUNTS },
    idempotencyKey: { type: String, required: true, unique: true, trim: true, maxlength: 255 },
    reversalOf: { type: Schema.Types.ObjectId, ref: 'LedgerEntry', default: null },
    note: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

ledgerEntrySchema.index({ storeId: 1, account: 1, createdAt: -1 });

export type LedgerEntry = InferSchemaType<typeof ledgerEntrySchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
};

export const LedgerEntryModel = model<LedgerEntry>('LedgerEntry', ledgerEntrySchema);
