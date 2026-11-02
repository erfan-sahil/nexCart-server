import { Types } from 'mongoose';
import { AppError } from '../../common/errors/AppError';
import { fulfillmentService } from '../fulfillment/fulfillment.service';
import { ShipmentModel } from '../fulfillment/shipment.model';
import { orderActivityService } from './order-activity.service';
import { adminVendorOrderStatusService } from './admin-vendor-order-status.service';
import { VendorOrderModel } from './vendor-order.model';
import { vendorOrderService } from './vendor-order.service';

export const adminOrderStatusService = {
  async updateStatus(
    adminUserId: string,
    orderId: string,
    input: {
      status: 'packed' | 'shipped' | 'out_for_delivery' | 'delivered' | 'cancelled';
      carrier?: string;
      trackingNumber?: string;
    },
  ) {
    if (input.status === 'cancelled') {
      return vendorOrderService.cancelByAdmin(adminUserId, orderId);
    }

    if (!Types.ObjectId.isValid(orderId)) {
      throw AppError.notFound('Order not found');
    }

    const orderObjectId = new Types.ObjectId(orderId);

    if (input.status === 'packed') {
      await adminVendorOrderStatusService.assertAllActiveVendorOrdersPackReady(orderObjectId);

      const shipment = await fulfillmentService.packShipment(adminUserId, orderId);

      await VendorOrderModel.updateMany(
        { parentOrderId: orderObjectId, status: { $nin: ['cancelled'] } },
        { $set: { status: 'packed' } },
      );

      await orderActivityService.log({
        parentOrderId: orderObjectId,
        actorUserId: adminUserId,
        actorRole: 'admin',
        action: 'order_packed',
      });

      return { orderId, shipment };
    }

    if (input.status === 'shipped') {
      if (!input.carrier?.trim() || !input.trackingNumber?.trim()) {
        throw AppError.validation('carrier and trackingNumber are required when shipping');
      }

      const result = await fulfillmentService.shipOrder(adminUserId, orderId, {
        carrier: input.carrier.trim(),
        trackingNumber: input.trackingNumber.trim(),
      });

      await VendorOrderModel.updateMany(
        { parentOrderId: orderObjectId, status: { $nin: ['cancelled'] } },
        { $set: { status: 'shipped' } },
      );

      return result;
    }

    if (input.status === 'out_for_delivery') {
      const result = await fulfillmentService.advanceShipment(
        adminUserId,
        orderId,
        'out_for_delivery',
      );

      await VendorOrderModel.updateMany(
        { parentOrderId: orderObjectId, status: { $nin: ['cancelled'] } },
        { $set: { status: 'out_for_delivery' } },
      );

      return result;
    }

    if (input.status === 'delivered') {
      const shipment = await ShipmentModel.findOne({ orderId: orderObjectId });

      if (shipment && shipment.status === 'dispatched') {
        await fulfillmentService.advanceShipment(adminUserId, orderId, 'out_for_delivery');
      }

      const result = await fulfillmentService.deliverOrder(adminUserId, orderId);

      await VendorOrderModel.updateMany(
        {
          parentOrderId: orderObjectId,
          status: { $nin: ['cancelled'] },
        },
        { $set: { status: 'delivered' } },
      );

      return result;
    }

    throw AppError.validation('Unsupported order status');
  },
};
