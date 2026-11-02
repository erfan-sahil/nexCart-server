import { Types } from 'mongoose';
import { AppError } from '../../common/errors/AppError';
import { isDuplicateKeyError } from '../../common/errors/mongoError';
import { rollupParentFulfillmentStatus } from '../orders/order-rollup.service';
import { VendorOrderModel } from '../orders/vendor-order.model';
import { LedgerEntryModel } from '../wallet/ledger-entry.model';
import { ReturnRequestModel } from './return-request.model';

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const returnService = {
  async listForVendor(vendorUserId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const filter = { vendorUserId: new Types.ObjectId(vendorUserId) };

    const [rows, total] = await Promise.all([
      ReturnRequestModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      ReturnRequestModel.countDocuments(filter),
    ]);

    return {
      items: rows.map((row) => ({
        id: String(row._id),
        parentOrderId: String(row.parentOrderId),
        vendorOrderId: String(row.vendorOrderId),
        status: row.status,
        reason: row.reason,
        refundAmount: row.refundAmount,
        createdAt: row.createdAt.toISOString(),
      })),
      page,
      limit,
      total,
    };
  },

  async listForAdmin(page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      ReturnRequestModel.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit),
      ReturnRequestModel.countDocuments({}),
    ]);

    return {
      items: rows.map((row) => ({
        id: String(row._id),
        parentOrderId: String(row.parentOrderId),
        vendorOrderId: String(row.vendorOrderId),
        storeId: String(row.storeId),
        status: row.status,
        reason: row.reason,
        refundAmount: row.refundAmount,
        createdAt: row.createdAt.toISOString(),
      })),
      page,
      limit,
      total,
    };
  },

  async approve(adminId: string, returnId: string) {
    const row = await ReturnRequestModel.findById(returnId);

    if (!row) {
      throw AppError.notFound('Return request not found');
    }

    if (row.status !== 'requested') {
      throw AppError.validation('Return is not awaiting approval');
    }

    row.status = 'approved';
    await row.save();

    return { id: String(row._id), status: row.status, reviewedBy: adminId };
  },

  async markRefunded(adminId: string, returnId: string) {
    const row = await ReturnRequestModel.findById(returnId);

    if (!row || row.status === 'refunded') {
      throw AppError.notFound('Return request not found');
    }

    const vendorOrder = await VendorOrderModel.findById(row.vendorOrderId);

    if (
      !vendorOrder ||
      vendorOrder.commissionRate === null ||
      vendorOrder.commissionAmount === null
    ) {
      throw AppError.validation('Vendor order commission snapshot is missing');
    }

    const merchandiseRefund = money(
      row.lines.reduce((sum, line) => {
        const item = vendorOrder.items.find(
          (orderLine) => String(orderLine.variantId) === String(line.variantId),
        );

        if (!item) {
          return sum;
        }

        return sum + item.unitPrice * line.quantity;
      }, 0),
    );

    const commissionReversal = money((merchandiseRefund * (vendorOrder.commissionRate ?? 0)) / 100);
    const vendorDebit = money(merchandiseRefund - commissionReversal);

    row.refundAmount = merchandiseRefund;
    row.status = 'refunded';
    await row.save();

    try {
      await LedgerEntryModel.create({
        vendorUserId: vendorOrder.vendorUserId,
        storeId: vendorOrder.storeId,
        vendorOrderId: vendorOrder._id,
        parentOrderId: vendorOrder.parentOrderId,
        type: 'refund_debit',
        amount: vendorDebit,
        account: 'available',
        idempotencyKey: `return:${String(row._id)}:vendor`,
        note: `Refund by ${adminId}`,
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }

    await rollupParentFulfillmentStatus(vendorOrder.parentOrderId);

    return {
      id: String(row._id),
      status: row.status,
      refundAmount: row.refundAmount,
    };
  },
};
