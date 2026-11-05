import type { ClientSession } from 'mongoose';
import { Types } from 'mongoose';
import { AppError } from '../../common/errors/AppError';
import { isDuplicateKeyError } from '../../common/errors/mongoError';
import { withTransaction } from '../../config/transaction';
import { orderActivityService } from '../orders/order-activity.service';
import { recordStockMovement, restoreStockWithMovement } from '../orders/stock-movement.service';
import { syncListing } from '../products/variant.service';
import type { ReturnRequest } from './return-request.model';
import {
  VendorReturnShipmentModel,
  type VendorReturnShipment,
} from './vendor-return-shipment.model';

const toDto = (row: VendorReturnShipment) => ({
  id: String(row._id),
  returnRequestId: String(row.returnRequestId),
  vendorOrderId: String(row.vendorOrderId),
  parentOrderId: String(row.parentOrderId),
  storeId: String(row.storeId),
  vendorUserId: String(row.vendorUserId),
  status: row.status,
  lines: row.lines.map((line) => ({
    variantId: String(line.variantId),
    productId: String(line.productId),
    productName: line.productName,
    sku: line.sku,
    quantity: line.quantity,
  })),
  carrier: row.carrier ?? '',
  trackingNumber: row.trackingNumber ?? '',
  dispatchedAt: row.dispatchedAt?.toISOString() ?? null,
  receivedByVendorAt: row.receivedByVendorAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export type VendorReturnShipmentDto = ReturnType<typeof toDto>;

const recordWarehouseCustody = async (row: VendorReturnShipment, session?: ClientSession) => {
  for (const line of row.lines) {
    await recordStockMovement({
      orderId: row.parentOrderId,
      variantId: line.variantId,
      productId: line.productId,
      quantity: line.quantity,
      direction: 'increment',
      custody: 'returned_to_warehouse',
      reason: 'vendor_return_warehouse_custody',
      idempotencyKey: `vendor-return:${String(row._id)}:${String(line.variantId)}:warehouse-in`,
      session,
    });
  }
};

const recordTransitCustody = async (row: VendorReturnShipment, session?: ClientSession) => {
  for (const line of row.lines) {
    await recordStockMovement({
      orderId: row.parentOrderId,
      variantId: line.variantId,
      productId: line.productId,
      quantity: line.quantity,
      direction: 'decrement',
      custody: 'returned_to_warehouse',
      reason: 'vendor_return_dispatch_out',
      idempotencyKey: `vendor-return:${String(row._id)}:${String(line.variantId)}:dispatch-out`,
      session,
    });

    await recordStockMovement({
      orderId: row.parentOrderId,
      variantId: line.variantId,
      productId: line.productId,
      quantity: line.quantity,
      direction: 'increment',
      custody: 'returned_to_vendor',
      reason: 'vendor_return_dispatch_in',
      idempotencyKey: `vendor-return:${String(row._id)}:${String(line.variantId)}:dispatch-in`,
      session,
    });
  }
};

export const vendorReturnShipmentService = {
  toDto,

  async createForRefundedReturn(returnRow: ReturnRequest, session?: ClientSession) {
    const sellableByVendor = new Map<
      string,
      {
        vendorOrderId: Types.ObjectId;
        storeId: Types.ObjectId;
        vendorUserId: Types.ObjectId;
        lines: Array<{
          variantId: Types.ObjectId;
          productId: Types.ObjectId;
          productName: string;
          sku: string;
          quantity: number;
        }>;
      }
    >();

    for (const line of returnRow.lines) {
      if (line.disposition !== 'sellable') {
        continue;
      }

      const key = String(line.vendorOrderId);
      const group = sellableByVendor.get(key) ?? {
        vendorOrderId: line.vendorOrderId,
        storeId: line.storeId,
        vendorUserId: line.vendorUserId,
        lines: [],
      };

      group.lines.push({
        variantId: line.variantId,
        productId: line.productId,
        productName: line.productName,
        sku: line.sku,
        quantity: line.quantity,
      });
      sellableByVendor.set(key, group);
    }

    const created: VendorReturnShipmentDto[] = [];

    for (const group of sellableByVendor.values()) {
      if (group.lines.length === 0) {
        continue;
      }

      const existingQuery = VendorReturnShipmentModel.findOne({
        returnRequestId: returnRow._id,
        vendorOrderId: group.vendorOrderId,
      });
      const existing = session ? await existingQuery.session(session) : await existingQuery;

      if (existing) {
        created.push(toDto(existing));
        continue;
      }

      const payload = {
        returnRequestId: returnRow._id,
        vendorOrderId: group.vendorOrderId,
        parentOrderId: returnRow.parentOrderId,
        storeId: group.storeId,
        vendorUserId: group.vendorUserId,
        status: 'pending_dispatch_to_vendor' as const,
        lines: group.lines,
      };

      try {
        let row: VendorReturnShipment;

        if (session) {
          const docs = await VendorReturnShipmentModel.create([payload], { session });
          const createdRow = docs[0];

          if (!createdRow) {
            continue;
          }

          row = createdRow;
        } else {
          row = await VendorReturnShipmentModel.create(payload);
        }

        await recordWarehouseCustody(row, session);
        created.push(toDto(row));
      } catch (error) {
        if (!isDuplicateKeyError(error)) {
          throw error;
        }

        const raced = await VendorReturnShipmentModel.findOne({
          returnRequestId: returnRow._id,
          vendorOrderId: group.vendorOrderId,
        });

        if (raced) {
          created.push(toDto(raced));
        }
      }
    }

    return created;
  },

  async dispatch(
    adminId: string,
    shipmentId: string,
    input: { carrier?: string; trackingNumber?: string } = {},
  ) {
    if (!Types.ObjectId.isValid(shipmentId)) {
      throw AppError.notFound('Vendor return shipment not found');
    }

    const result = await withTransaction(async (session) => {
      const updated = await VendorReturnShipmentModel.findOneAndUpdate(
        {
          _id: shipmentId,
          status: 'pending_dispatch_to_vendor',
        },
        {
          $set: {
            status: 'in_transit_to_vendor',
            carrier: input.carrier?.trim() ?? '',
            trackingNumber: input.trackingNumber?.trim() ?? '',
            dispatchedAt: new Date(),
            dispatchedByAdminId: new Types.ObjectId(adminId),
          },
        },
        { new: true, session },
      );

      if (!updated) {
        const existing = await VendorReturnShipmentModel.findById(shipmentId).session(session);

        if (!existing) {
          throw AppError.notFound('Vendor return shipment not found');
        }

        if (
          existing.status === 'in_transit_to_vendor' ||
          existing.status === 'received_by_vendor'
        ) {
          return { dto: toDto(existing), newlyDispatched: false };
        }

        throw AppError.validation('Vendor return shipment is not awaiting dispatch');
      }

      await recordTransitCustody(updated, session);

      return { dto: toDto(updated), newlyDispatched: true };
    });

    if (result.newlyDispatched) {
      await orderActivityService.log({
        parentOrderId: result.dto.parentOrderId,
        vendorOrderId: result.dto.vendorOrderId,
        actorUserId: adminId,
        actorRole: 'admin',
        action: 'vendor_return_dispatched',
        metadata: {
          vendorReturnShipmentId: result.dto.id,
          carrier: result.dto.carrier,
          trackingNumber: result.dto.trackingNumber,
        },
      });
    }

    return result.dto;
  },

  async confirmReceipt(vendorUserId: string, shipmentId: string) {
    if (!Types.ObjectId.isValid(shipmentId)) {
      throw AppError.notFound('Vendor return shipment not found');
    }

    const productIds = new Set<string>();

    const result = await withTransaction(async (session) => {
      const updated = await VendorReturnShipmentModel.findOneAndUpdate(
        {
          _id: shipmentId,
          vendorUserId: new Types.ObjectId(vendorUserId),
          status: 'in_transit_to_vendor',
        },
        {
          $set: {
            status: 'received_by_vendor',
            receivedByVendorAt: new Date(),
          },
        },
        { new: true, session },
      );

      if (!updated) {
        const existing = await VendorReturnShipmentModel.findOne({
          _id: shipmentId,
          vendorUserId: new Types.ObjectId(vendorUserId),
        }).session(session);

        if (!existing) {
          throw AppError.notFound('Vendor return shipment not found');
        }

        if (existing.status === 'received_by_vendor') {
          return { dto: toDto(existing), newlyReceived: false };
        }

        throw AppError.validation('Vendor return shipment is not in transit');
      }

      for (const line of updated.lines) {
        const restored = await restoreStockWithMovement({
          orderId: updated.parentOrderId,
          variantId: line.variantId,
          productId: line.productId,
          quantity: line.quantity,
          reason: 'vendor_return_received',
          idempotencyKey: `vendor-return:${String(updated._id)}:line:${String(line.variantId)}:restock`,
          session,
          deferListingSync: true,
        });

        if (restored) {
          productIds.add(String(line.productId));
        }
      }

      return { dto: toDto(updated), newlyReceived: true };
    });

    for (const productId of productIds) {
      await syncListing(new Types.ObjectId(productId));
    }

    if (result.newlyReceived) {
      await orderActivityService.log({
        parentOrderId: result.dto.parentOrderId,
        vendorOrderId: result.dto.vendorOrderId,
        actorUserId: vendorUserId,
        actorRole: 'vendor',
        action: 'vendor_return_received',
        metadata: { vendorReturnShipmentId: result.dto.id },
      });
    }

    return result.dto;
  },

  async listForAdmin(
    page: number,
    limit: number,
    filters?: { status?: string; storeId?: string; parentOrderId?: string },
  ) {
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = {};

    if (filters?.status) {
      filter.status = filters.status;
    }

    if (filters?.storeId && Types.ObjectId.isValid(filters.storeId)) {
      filter.storeId = new Types.ObjectId(filters.storeId);
    }

    if (filters?.parentOrderId && Types.ObjectId.isValid(filters.parentOrderId)) {
      filter.parentOrderId = new Types.ObjectId(filters.parentOrderId);
    }

    const [rows, total] = await Promise.all([
      VendorReturnShipmentModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      VendorReturnShipmentModel.countDocuments(filter),
    ]);

    return {
      items: rows.map(toDto),
      page,
      limit,
      total,
    };
  },

  async listForVendor(vendorUserId: string, page: number, limit: number, status?: string) {
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = {
      vendorUserId: new Types.ObjectId(vendorUserId),
    };

    if (status) {
      filter.status = status;
    }

    const [rows, total] = await Promise.all([
      VendorReturnShipmentModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      VendorReturnShipmentModel.countDocuments(filter),
    ]);

    return {
      items: rows.map(toDto),
      page,
      limit,
      total,
    };
  },

  async getById(shipmentId: string) {
    if (!Types.ObjectId.isValid(shipmentId)) {
      throw AppError.notFound('Vendor return shipment not found');
    }

    const row = await VendorReturnShipmentModel.findById(shipmentId);

    if (!row) {
      throw AppError.notFound('Vendor return shipment not found');
    }

    return toDto(row);
  },

  async listForVendorOrder(vendorOrderId: Types.ObjectId | string) {
    const rows = await VendorReturnShipmentModel.find({
      vendorOrderId: new Types.ObjectId(vendorOrderId),
    }).sort({ createdAt: -1 });

    return rows.map(toDto);
  },

  async listForReturn(returnRequestId: Types.ObjectId | string) {
    const rows = await VendorReturnShipmentModel.find({
      returnRequestId: new Types.ObjectId(returnRequestId),
    }).sort({ createdAt: -1 });

    return rows.map(toDto);
  },

  async listForParentOrder(parentOrderId: Types.ObjectId | string) {
    const rows = await VendorReturnShipmentModel.find({
      parentOrderId: new Types.ObjectId(parentOrderId),
    }).sort({ createdAt: -1 });

    return rows.map(toDto);
  },
};
