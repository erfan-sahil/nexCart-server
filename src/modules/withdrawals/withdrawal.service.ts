import { Types } from 'mongoose';
import { AppError } from '../../common/errors/AppError';
import { isDuplicateKeyError } from '../../common/errors/mongoError';
import { withTransaction } from '../../config/transaction';
import { StorePayoutModel } from '../payments/store-payout.model';
import { storeService } from '../stores/store.service';
import { LedgerEntryModel } from '../wallet/ledger-entry.model';
import { walletService } from '../wallet/wallet.service';
import { WithdrawalModel } from './withdrawal.model';

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const normalizeMethod = (method: string, provider: string) => {
  if (method === 'bank') {
    return 'bank' as const;
  }

  const normalized = provider.toLowerCase();

  if (normalized === 'bkash' || normalized === 'nagad') {
    return normalized;
  }

  return null;
};

export const withdrawalService = {
  async create(vendorUserId: string, amountInput: number) {
    const amount = money(amountInput);

    if (amount <= 0) {
      throw AppError.validation('Withdrawal amount must be greater than zero');
    }

    const store = await storeService.getMine(vendorUserId);
    const payout = await StorePayoutModel.findOne({ storeId: store.id });

    if (!payout) {
      throw AppError.validation('Add a payout account before requesting a withdrawal');
    }

    const method = normalizeMethod(payout.method, payout.provider ?? '');

    if (!method) {
      throw AppError.validation('Mobile payout provider must be bkash or nagad');
    }

    const balances = await walletService.getStoreBalances(store.id);

    if (amount > balances.availableBalance) {
      throw AppError.validation('Amount exceeds available balance');
    }

    try {
      return await withTransaction(async (session) => {
        const freshBalances = await walletService.getStoreBalances(store.id);

        if (amount > freshBalances.availableBalance) {
          throw AppError.validation('Amount exceeds available balance');
        }

        const created = await WithdrawalModel.create(
          [
            {
              vendorUserId: new Types.ObjectId(vendorUserId),
              storeId: new Types.ObjectId(store.id),
              amount,
              method,
              accountHolderName: payout.accountHolderName,
              accountNumber: payout.accountNumber,
              bankName: payout.bankName ?? '',
              provider: payout.provider ?? '',
              status: 'pending',
            },
          ],
          { session },
        );

        const withdrawal = created[0];

        if (!withdrawal) {
          throw AppError.internal('Withdrawal could not be created');
        }

        await LedgerEntryModel.create(
          [
            {
              vendorUserId: withdrawal.vendorUserId,
              storeId: withdrawal.storeId,
              type: 'withdrawal_debit',
              amount,
              account: 'available',
              idempotencyKey: `withdrawal:${String(withdrawal._id)}:reserve`,
            },
          ],
          { session },
        );

        return {
          id: String(withdrawal._id),
          amount: withdrawal.amount,
          status: withdrawal.status,
          method: withdrawal.method,
          createdAt: withdrawal.createdAt.toISOString(),
        };
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw error;
    }
  },

  async cancel(vendorUserId: string, withdrawalId: string) {
    const withdrawal = await WithdrawalModel.findOne({
      _id: withdrawalId,
      vendorUserId,
    });

    if (!withdrawal) {
      throw AppError.notFound('Withdrawal not found');
    }

    if (withdrawal.status !== 'pending') {
      throw AppError.validation('Only pending withdrawals can be cancelled');
    }

    withdrawal.status = 'cancelled';
    await withdrawal.save();

    try {
      await LedgerEntryModel.create({
        vendorUserId: withdrawal.vendorUserId,
        storeId: withdrawal.storeId,
        type: 'withdrawal_reversal',
        amount: withdrawal.amount,
        account: 'available',
        idempotencyKey: `withdrawal:${String(withdrawal._id)}:cancel`,
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }

    return { id: String(withdrawal._id), status: withdrawal.status };
  },

  async listForVendor(vendorUserId: string, page: number, limit: number) {
    const store = await storeService.getMine(vendorUserId);
    const skip = (page - 1) * limit;
    const filter = { storeId: new Types.ObjectId(store.id) };

    const [rows, total] = await Promise.all([
      WithdrawalModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      WithdrawalModel.countDocuments(filter),
    ]);

    return {
      items: rows.map((row) => ({
        id: String(row._id),
        amount: row.amount,
        status: row.status,
        method: row.method,
        payoutReference: row.payoutReference,
        createdAt: row.createdAt.toISOString(),
      })),
      page,
      limit,
      total,
    };
  },

  async listForAdmin(status: string | undefined, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const filter = status ? { status } : {};

    const [rows, total] = await Promise.all([
      WithdrawalModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      WithdrawalModel.countDocuments(filter),
    ]);

    return {
      items: rows.map((row) => ({
        id: String(row._id),
        storeId: String(row.storeId),
        amount: row.amount,
        status: row.status,
        method: row.method,
        accountHolderName: row.accountHolderName,
        accountNumber: row.accountNumber,
        payoutReference: row.payoutReference,
        reviewNote: row.reviewNote,
        createdAt: row.createdAt.toISOString(),
      })),
      page,
      limit,
      total,
    };
  },

  async review(
    adminId: string,
    withdrawalId: string,
    action: 'approve' | 'reject' | 'processing' | 'paid',
    input: { reviewNote?: string; payoutReference?: string },
  ) {
    const withdrawal = await WithdrawalModel.findById(withdrawalId);

    if (!withdrawal) {
      throw AppError.notFound('Withdrawal not found');
    }

    if (action === 'paid' && !input.payoutReference?.trim()) {
      throw AppError.validation('Payout reference is required');
    }

    const transitions: Record<string, string[]> = {
      approve: ['pending'],
      reject: ['pending', 'approved', 'processing'],
      processing: ['approved'],
      paid: ['processing'],
    };

    if (!transitions[action]?.includes(withdrawal.status)) {
      throw AppError.validation('Withdrawal cannot move to that status');
    }

    if (action === 'approve') {
      withdrawal.status = 'approved';
    } else if (action === 'processing') {
      withdrawal.status = 'processing';
    } else if (action === 'paid') {
      withdrawal.status = 'paid';
      withdrawal.payoutReference = input.payoutReference?.trim() ?? '';
    } else {
      withdrawal.status = 'rejected';
      try {
        await LedgerEntryModel.create({
          vendorUserId: withdrawal.vendorUserId,
          storeId: withdrawal.storeId,
          type: 'withdrawal_reversal',
          amount: withdrawal.amount,
          account: 'available',
          idempotencyKey: `withdrawal:${String(withdrawal._id)}:reject`,
        });
      } catch (error) {
        if (!isDuplicateKeyError(error)) {
          throw error;
        }
      }
    }

    withdrawal.reviewNote = input.reviewNote?.trim() ?? withdrawal.reviewNote;
    withdrawal.reviewedBy = new Types.ObjectId(adminId);
    withdrawal.reviewedAt = new Date();
    await withdrawal.save();

    return {
      id: String(withdrawal._id),
      status: withdrawal.status,
      payoutReference: withdrawal.payoutReference,
    };
  },
};
