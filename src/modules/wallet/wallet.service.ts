import { Types } from 'mongoose';
import { AppError } from '../../common/errors/AppError';
import { isDuplicateKeyError } from '../../common/errors/mongoError';
import { SiteSettingsModel } from '../site-settings/site-settings.model';
import { StoreModel } from '../stores/store.model';
import { OrderModel } from '../orders/order.model';
import { VendorOrderModel } from '../orders/vendor-order.model';
import { ShipmentModel } from '../fulfillment/shipment.model';
import { WithdrawalModel } from '../withdrawals/withdrawal.model';
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

  async getReleasedAmountForVendorOrder(vendorOrderId: Types.ObjectId | string) {
    const rows = await LedgerEntryModel.aggregate<{ total: number }>([
      {
        $match: {
          vendorOrderId: new Types.ObjectId(String(vendorOrderId)),
          type: 'settlement_release',
          account: 'pending',
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    return money(rows[0]?.total ?? 0);
  },

  async releaseEligibleForStore(
    storeId: string,
    options: {
      bypassHoldDays?: boolean;
      bypassPaymentChecks?: boolean;
      maxAmount?: number;
      note?: string;
    } = {},
  ) {
    const bypassHoldDays = options.bypassHoldDays === true;
    const bypassPaymentChecks = options.bypassPaymentChecks === true;
    const note = options.note?.trim() ?? '';
    const hasAmountCap = typeof options.maxAmount === 'number';
    let remainingBudget = hasAmountCap ? money(options.maxAmount ?? 0) : null;

    if (remainingBudget !== null && remainingBudget <= 0) {
      return {
        releasedCount: 0,
        releasedAmount: 0,
        skippedHeld: 0,
        skippedPayment: 0,
        skippedAlreadyReleased: 0,
      };
    }

    const completed = await VendorOrderModel.find({
      storeId,
      status: { $in: ['delivered', 'completed'] },
      vendorEarnings: { $gt: 0 },
    }).select('_id vendorEarnings parentOrderId vendorUserId storeId createdAt');

    const { holdDays } = await commissionService.resolveRate(storeId);

    const candidates: Array<{
      vendorOrder: (typeof completed)[number];
      deliveredAt: Date;
    }> = [];

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

      candidates.push({ vendorOrder, deliveredAt: shipment.deliveredAt });
    }

    candidates.sort((a, b) => a.deliveredAt.getTime() - b.deliveredAt.getTime());

    let releasedCount = 0;
    let releasedAmount = 0;

    for (const { vendorOrder } of candidates) {
      if (remainingBudget !== null && remainingBudget <= 0) {
        break;
      }

      const earnings = money(vendorOrder.vendorEarnings ?? 0);

      if (earnings <= 0) {
        continue;
      }

      const alreadyReleased = await this.getReleasedAmountForVendorOrder(vendorOrder._id);
      const remainingOnOrder = money(earnings - alreadyReleased);

      if (remainingOnOrder <= 0) {
        skippedAlreadyReleased += 1;
        continue;
      }

      const amount =
        remainingBudget === null
          ? remainingOnOrder
          : money(Math.min(remainingOnOrder, remainingBudget));

      if (amount <= 0) {
        continue;
      }

      const releaseKey =
        alreadyReleased === 0 && amount === earnings
          ? `vendorOrder:${String(vendorOrder._id)}:release`
          : `vendorOrder:${String(vendorOrder._id)}:release:from:${alreadyReleased}:amt:${amount}`;

      const existing = await LedgerEntryModel.findOne({ idempotencyKey: releaseKey }).select('_id');

      if (existing) {
        skippedAlreadyReleased += 1;
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

        if (remainingBudget !== null) {
          remainingBudget = money(remainingBudget - amount);
        }
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
    input: { force?: boolean; amount?: number; note?: string } = {},
  ) {
    const force = input.force === true;
    const hasAmount = typeof input.amount === 'number';
    const amount = hasAmount ? money(input.amount ?? 0) : undefined;

    if (hasAmount && (amount === undefined || amount <= 0)) {
      throw AppError.validation('Release amount must be greater than zero');
    }

    const pendingSettlement = await this.sumAccount(storeId, 'pending');

    if (hasAmount && amount !== undefined && amount > pendingSettlement) {
      throw AppError.validation('Amount exceeds pending settlement');
    }

    const note =
      input.note?.trim() ||
      (force
        ? hasAmount
          ? `Admin force release of ${amount}`
          : 'Admin force release: hold and payment checks bypassed'
        : hasAmount
          ? `Admin early release of ${amount}`
          : 'Admin early release: settlement hold bypassed');

    const result = await this.releaseEligibleForStore(storeId, {
      bypassHoldDays: true,
      bypassPaymentChecks: force,
      maxAmount: amount,
      note,
    });

    if (hasAmount && amount !== undefined && result.releasedAmount + 0.001 < amount) {
      if (result.releasedAmount <= 0) {
        throw AppError.validation(
          force
            ? 'No delivered order earnings available to release for this amount'
            : 'Not enough eligible order earnings. Enable force release or wait for payment clearance.',
        );
      }
    }

    const [pendingAfter, availableBalance] = await Promise.all([
      this.sumAccount(storeId, 'pending'),
      this.sumAccount(storeId, 'available'),
    ]);

    return {
      storeId,
      ...result,
      requestedAmount: amount ?? null,
      pendingSettlement: pendingAfter,
      availableBalance,
      force,
    };
  },

  /**
   * Withdrawals admin has accepted (approved → processing → paid).
   * Pending requests reserve available balance but are not counted here.
   */
  async getWithdrawnBalance(storeId: string) {
    const rows = await WithdrawalModel.aggregate<{ total: number }>([
      {
        $match: {
          storeId: new Types.ObjectId(storeId),
          status: { $in: ['approved', 'processing', 'paid'] },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    return money(Math.max(0, rows[0]?.total ?? 0));
  },

  /** Funds reserved on available while a withdrawal awaits admin review. */
  async getReservedWithdrawalBalance(storeId: string) {
    const rows = await WithdrawalModel.aggregate<{ total: number }>([
      {
        $match: {
          storeId: new Types.ObjectId(storeId),
          status: 'pending',
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    return money(Math.max(0, rows[0]?.total ?? 0));
  },

  async getStoreBalances(storeId: string) {
    await this.releaseEligibleForStore(storeId);

    const [pending, available, withdrawn, reservedWithdrawals] = await Promise.all([
      this.sumAccount(storeId, 'pending'),
      this.sumAccount(storeId, 'available'),
      this.getWithdrawnBalance(storeId),
      this.getReservedWithdrawalBalance(storeId),
    ]);

    return {
      pendingSettlement: pending,
      availableBalance: available,
      withdrawnBalance: withdrawn,
      totalBalance: money(pending + available + withdrawn + reservedWithdrawals),
    };
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
