import { connectDatabase, disconnectDatabase } from '../config/database';
import { logger } from '../common/utils/logger';
import { VENDOR_ORDER_STATUSES } from '../modules/orders/constants';
import { VendorOrderModel } from '../modules/orders/vendor-order.model';

/** Legacy vendor-order status values before unified lifecycle (Mongo may still contain these). */
const LEGACY_VENDOR_ORDER_STATUS_MAP: Record<string, (typeof VENDOR_ORDER_STATUSES)[number]> = {
  ready_to_ship: 'preparing',
  in_transit: 'sending_to_warehouse',
  received: 'received_at_warehouse',
  accepted: 'accepted_at_warehouse',
  rejected: 'rejected_at_warehouse',
  completed: 'delivered',
};

const inferAcceptedCumulative = (
  status: string,
  quantity: number,
  targetQty: number,
  current: number,
) => {
  if (current > 0) {
    return current;
  }

  if (
    status === 'accepted_at_warehouse' ||
    status === 'packed' ||
    status === 'shipped' ||
    status === 'out_for_delivery' ||
    status === 'delivered'
  ) {
    return targetQty;
  }

  if (status === 'partially_accepted') {
    return Math.min(quantity, Math.max(0, targetQty - 1));
  }

  return 0;
};

async function migrateVendorOrders() {
  await connectDatabase();

  let statusUpdates = 0;
  let lineUpdates = 0;

  for (const [legacy, next] of Object.entries(LEGACY_VENDOR_ORDER_STATUS_MAP)) {
    const result = await VendorOrderModel.updateMany(
      { status: legacy },
      { $set: { status: next } },
    );
    statusUpdates += result.modifiedCount ?? 0;
  }

  const cursor = VendorOrderModel.find().cursor();

  for await (const row of cursor) {
    let dirty = false;

    for (const line of row.items) {
      const expectedQty = line.expectedQty ?? line.quantity;
      const targetQty = line.targetQty ?? line.quantity;
      const acceptedQtyCumulative = inferAcceptedCumulative(
        row.status,
        line.quantity,
        targetQty,
        line.acceptedQtyCumulative ?? 0,
      );

      if (
        line.expectedQty !== expectedQty ||
        line.targetQty !== targetQty ||
        line.acceptedQtyCumulative !== acceptedQtyCumulative
      ) {
        line.expectedQty = expectedQty;
        line.targetQty = targetQty;
        line.acceptedQtyCumulative = acceptedQtyCumulative;
        dirty = true;
        lineUpdates += 1;
      }
    }

    if (dirty) {
      row.markModified('items');
      await row.save();
    }
  }

  const invalid = await VendorOrderModel.countDocuments({
    status: { $nin: [...VENDOR_ORDER_STATUSES] },
  });

  logger.info('Vendor order lifecycle migration finished', {
    statusUpdates,
    lineFieldRowsTouched: lineUpdates,
    remainingInvalidStatuses: invalid,
  });

  if (invalid > 0) {
    logger.warn('Some vendor orders still have unknown status values — review manually');
  }

  await disconnectDatabase();
}

migrateVendorOrders().catch((error) => {
  logger.error('Vendor order migration failed', { error });
  process.exitCode = 1;
});
