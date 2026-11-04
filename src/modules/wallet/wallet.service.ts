import { Types } from 'mongoose';
import { SiteSettingsModel } from '../site-settings/site-settings.model';
import { StoreModel } from '../stores/store.model';
import { OrderModel } from '../orders/order.model';
import { VendorOrderModel } from '../orders/vendor-order.model';
import { isDuplicateKeyError } from '../../common/errors/mongoError';
import { ShipmentModel } from '../fulfillment/shipment.model';
import { LedgerEntryModel } from './ledger-entry.model';

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const DEFAULT_COMMISSION_RATE = 10;
const DEFAULT_HOLD_DAYS = 7;

export const commissionService = {
  async resolveRate(storeId: Types.ObjectId | string) {
    const [settings, store] = await Promise.all([
      SiteSettingsModel.findOne().select('defaultCommissionRate settlementHoldDays'),
      StoreModel.findById(storeId).select('commissionRate'),
    ]);

    if (store?.commissionRate !== null && store?.commissionRate !== undefined) {
      return {
        rate: store.commissionRate,
        holdDays: settings?.settlementHoldDays ?? DEFAULT_HOLD_DAYS,
      };
    }

    return {
      rate: settings?.defaultCommissionRate ?? DEFAULT_COMMISSION_RATE,
      holdDays: settings?.settlementHoldDays ?? DEFAULT_HOLD_DAYS,
    };
  },
};

export const walletService = {
  async applyCommissionSnapshot(vendorOrderId: Types.ObjectId | string) {
    const row = await VendorOrderModel.findById(vendorOrderId);

    if (!row || typeof row.commissionRate === 'number') {
      return;
    }

    const { rate } = await commissionService.resolveRate(row.storeId);
    const commissionAmount = money((row.itemsSubtotal * rate) / 100);
    const vendorEarnings = money(row.itemsSubtotal - commissionAmount);

    await VendorOrderModel.updateOne(
      { _id: row._id, commissionRate: null },
      { $set: { commissionRate: rate, commissionAmount, vendorEarnings } },
    );

    await this.postVendorOrderEarnings(String(row._id));
  },

  async postVendorOrderEarnings(vendorOrderId: string) {
    const row = await VendorOrderModel.findById(vendorOrderId);

    if (!row || row.commissionRate === null || row.commissionAmount === null) {
      return;
    }

    const saleKey = `vendorOrder:${String(row._id)}:sale`;
    const commissionKey = `vendorOrder:${String(row._id)}:commission`;

    try {
      await LedgerEntryModel.create({
        vendorUserId: row.vendorUserId,
        storeId: row.storeId,
        vendorOrderId: row._id,
        parentOrderId: row.parentOrderId,
        type: 'sale_credit',
        amount: row.itemsSubtotal,
        account: 'pending',
        idempotencyKey: saleKey,
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }

    try {
      await LedgerEntryModel.create({
        vendorUserId: row.vendorUserId,
        storeId: row.storeId,
        vendorOrderId: row._id,
        parentOrderId: row.parentOrderId,
        type: 'commission_debit',
        amount: row.commissionAmount,
        account: 'pending',
        idempotencyKey: commissionKey,
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }
  },

  async sumAccount(storeId: string, account: 'pending' | 'available') {
    const creditTypes =
      account === 'pending'
        ? ['sale_credit', 'adjustment_credit', 'withdrawal_reversal']
        : ['settlement_release', 'adjustment_credit', 'withdrawal_reversal'];
    const debitTypes =
      account === 'pending'
        ? [
            'commission_debit',
            'settlement_release',
            'refund_debit',
            'adjustment_debit',
            'withdrawal_debit',
          ]
        : ['refund_debit', 'adjustment_debit', 'withdrawal_debit'];

    const rows = await LedgerEntryModel.aggregate<{ credits: number; debits: number }>([
      { $match: { storeId: new Types.ObjectId(storeId), account } },
      {
        $group: {
          _id: null,
          credits: {
            $sum: {
              $cond: [{ $in: ['$type', creditTypes] }, '$amount', 0],
            },
          },
          debits: {
            $sum: {
              $cond: [{ $in: ['$type', debitTypes] }, '$amount', 0],
            },
          },
        },
      },
    ]);

    const totals = rows[0] ?? { credits: 0, debits: 0 };
    return money(totals.credits - totals.debits);
  },

  async releaseEligibleForStore(
    storeId: string,
    options: {
      bypassHoldDays?: boolean;
      bypassPaymentChecks?: boolean;
      note?: string;
    } = {},
  ) {
    const bypassHoldDays = options.bypassHoldDays === true;
    const bypassPaymentChecks = options.bypassPaymentChecks === true;
    const note = options.note?.trim() ?? '';

    const completed = await VendorOrderModel.find({
      storeId,
      status: { $in: ['delivered', 'completed'] },
      vendorEarnings: { $gt: 0 },
    }).select('_id vendorEarnings parentOrderId vendorUserId storeId');

    const { holdDays } = await commissionService.resolveRate(storeId);

    let releasedCount = 0;
    let releasedAmount = 0;
    let skippedHeld = 0;
    let skippedPayment = 0;
    let skippedAlreadyReleased = 0;

    for (const vendorOrder of completed) {
      const parent = await OrderModel.findById(vendorOrder.parentOrderId).select(
        'paymentStatus paymentMethod codRemittanceStatus',
      );

      if (!parent) {
        continue;
      }

      if (!bypassPaymentChecks) {
        if (parent.paymentMethod === 'prepaid' && parent.paymentStatus !== 'paid') {
          skippedPayment += 1;
          continue;
        }

        if (parent.paymentMethod === 'cod' && parent.codRemittanceStatus !== 'reconciled') {
          skippedPayment += 1;
          continue;
        }
      }

      const shipment = await ShipmentModel.findOne({ orderId: vendorOrder.parentOrderId }).select(
        'deliveredAt',
      );

      if (!shipment?.deliveredAt) {
        continue;
      }

      if (!bypassHoldDays) {
        const holdUntil = new Date(shipment.deliveredAt.getTime() + holdDays * 24 * 60 * 60 * 1000);

        if (holdUntil.getTime() > Date.now()) {
          skippedHeld += 1;
          continue;
        }
      }

      const releaseKey = `vendorOrder:${String(vendorOrder._id)}:release`;
      const existing = await LedgerEntryModel.findOne({ idempotencyKey: releaseKey }).select('_id');

      if (existing) {
        skippedAlreadyReleased += 1;
        continue;
      }

      const amount = vendorOrder.vendorEarnings ?? 0;

      if (amount <= 0) {
        continue;
      }

      try {
        await LedgerEntryModel.create([
          {
            vendorUserId: vendorOrder.vendorUserId,
            storeId: vendorOrder.storeId,
            vendorOrderId: vendorOrder._id,
            parentOrderId: vendorOrder.parentOrderId,
            type: 'settlement_release',
            amount,
            account: 'pending',
            idempotencyKey: releaseKey,
            note,
          },
          {
            vendorUserId: vendorOrder.vendorUserId,
            storeId: vendorOrder.storeId,
            vendorOrderId: vendorOrder._id,
            parentOrderId: vendorOrder.parentOrderId,
            type: 'settlement_release',
            amount,
            account: 'available',
            idempotencyKey: `${releaseKey}:credit`,
            note,
          },
        ]);
        releasedCount += 1;
        releasedAmount = money(releasedAmount + amount);
      } catch (error) {
        if (!isDuplicateKeyError(error)) {
          throw error;
        }
        skippedAlreadyReleased += 1;
      }
    }

    return {
      releasedCount,
      releasedAmount,
      skippedHeld,
      skippedPayment,
      skippedAlreadyReleased,
    };
  },

  async adminReleaseStoreSettlement(
    storeId: string,
    input: { force?: boolean; note?: string } = {},
  ) {
    const force = input.force === true;
    const note =
      input.note?.trim() ||
      (force
        ? 'Admin force release: hold and payment checks bypassed'
        : 'Admin early release: settlement hold bypassed');

    const result = await this.releaseEligibleForStore(storeId, {
      bypassHoldDays: true,
      bypassPaymentChecks: force,
      note,
    });

    const [pendingSettlement, availableBalance] = await Promise.all([
      this.sumAccount(storeId, 'pending'),
      this.sumAccount(storeId, 'available'),
    ]);

    return {
      storeId,
      ...result,
      pendingSettlement,
      availableBalance,
      force,
    };
  },

  async getStoreBalances(storeId: string) {
    await this.releaseEligibleForStore(storeId);

    const [pending, available] = await Promise.all([
      this.sumAccount(storeId, 'pending'),
      this.sumAccount(storeId, 'available'),
    ]);

    return { pendingSettlement: pending, availableBalance: available };
  },

  async listForStore(storeId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const filter = { storeId: new Types.ObjectId(storeId) };

    const [rows, total] = await Promise.all([
      LedgerEntryModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      LedgerEntryModel.countDocuments(filter),
    ]);

    return {
      items: rows.map((row) => ({
        id: String(row._id),
        type: row.type,
        amount: row.amount,
        account: row.account,
        vendorOrderId: row.vendorOrderId ? String(row.vendorOrderId) : null,
        createdAt: row.createdAt.toISOString(),
      })),
      page,
      limit,
      total,
    };
  },

  async reversePendingEarnings(vendorOrderId: Types.ObjectId | string) {
    const row = await VendorOrderModel.findById(vendorOrderId);

    if (!row || row.commissionRate === null || row.commissionAmount === null) {
      return;
    }

    const saleKey = `vendorOrder:${String(row._id)}:sale:reverse`;
    const commissionKey = `vendorOrder:${String(row._id)}:commission:reverse`;

    try {
      await LedgerEntryModel.create({
        vendorUserId: row.vendorUserId,
        storeId: row.storeId,
        vendorOrderId: row._id,
        parentOrderId: row.parentOrderId,
        type: 'adjustment_debit',
        amount: row.itemsSubtotal,
        account: 'pending',
        idempotencyKey: saleKey,
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }

    try {
      await LedgerEntryModel.create({
        vendorUserId: row.vendorUserId,
        storeId: row.storeId,
        vendorOrderId: row._id,
        parentOrderId: row.parentOrderId,
        type: 'adjustment_credit',
        amount: row.commissionAmount,
        account: 'pending',
        idempotencyKey: commissionKey,
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }
  },

  async adjustPendingEarningsToSubtotal(
    vendorOrderId: Types.ObjectId | string,
    newSubtotal: number,
  ) {
    const row = await VendorOrderModel.findById(vendorOrderId);

    if (!row || row.commissionRate === null || row.commissionRate === undefined) {
      return;
    }

    const rate = row.commissionRate;
    const commissionAmount = money((newSubtotal * rate) / 100);
    const vendorEarnings = money(newSubtotal - commissionAmount);

    await VendorOrderModel.updateOne(
      { _id: row._id },
      {
        $set: {
          itemsSubtotal: newSubtotal,
          commissionAmount,
          vendorEarnings,
        },
      },
    );

    const adjustKey = `vendorOrder:${String(row._id)}:adjust:${newSubtotal}`;

    try {
      await LedgerEntryModel.create({
        vendorUserId: row.vendorUserId,
        storeId: row.storeId,
        vendorOrderId: row._id,
        parentOrderId: row.parentOrderId,
        type: 'adjustment_debit',
        amount: Math.max(0, row.itemsSubtotal - newSubtotal),
        account: 'pending',
        idempotencyKey: `${adjustKey}:sale-debit`,
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }
  },
};
