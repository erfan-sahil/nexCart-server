import type { Types } from 'mongoose';
import { OrderModel } from './order.model';
import { VendorFulfillmentModel } from '../fulfillment/vendor-fulfillment.model';
import { ShipmentModel } from '../fulfillment/shipment.model';
import type { OrderFulfillmentStatus } from './constants';

export const rollupParentFulfillmentStatus = async (parentOrderId: Types.ObjectId | string) => {
  const order = await OrderModel.findById(parentOrderId).select('fulfillmentStatus status');

  if (!order || order.fulfillmentStatus === 'cancelled') {
    return;
  }

  const fulfillments = await VendorFulfillmentModel.find({ orderId: order._id }).select('status');
  const shipment = await ShipmentModel.findOne({ orderId: order._id }).select('status');

  if (fulfillments.length === 0) {
    return;
  }

  let next: OrderFulfillmentStatus = order.fulfillmentStatus ?? 'confirmed';

  const allAccepted = fulfillments.every((row) => row.status === 'accepted');

  if (allAccepted && ['confirmed', 'processing'].includes(order.fulfillmentStatus ?? 'confirmed')) {
    next = 'ready_for_dispatch';
  }

  if (shipment) {
    if (['dispatched', 'in_transit', 'out_for_delivery'].includes(shipment.status)) {
      next = 'shipped';
    }

    if (shipment.status === 'delivered') {
      next = 'delivered';
    }

    if (
      ['delivery_failed', 'customer_rejected', 'returning_to_warehouse'].includes(shipment.status)
    ) {
      next = order.fulfillmentStatus === 'partially_returned' ? 'partially_returned' : 'returned';
    }

    if (shipment.status === 'returned_to_warehouse') {
      next = order.fulfillmentStatus === 'partially_returned' ? 'partially_returned' : 'returned';
    }
  }

  if (next !== order.fulfillmentStatus) {
    await OrderModel.updateOne({ _id: order._id }, { $set: { fulfillmentStatus: next } });
  }

  if (next === 'shipped' && order.status === 'confirmed') {
    await OrderModel.updateOne({ _id: order._id }, { $set: { status: 'shipped' } });
  }

  if (next === 'delivered' && order.status !== 'delivered') {
    await OrderModel.updateOne({ _id: order._id }, { $set: { status: 'delivered' } });
  }
};
