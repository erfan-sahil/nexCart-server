import { VendorFulfillmentModel } from './vendor-fulfillment.model';
import { VendorOrderModel } from '../orders/vendor-order.model';

export const migrateFulfillmentRecords = async () => {
  await VendorFulfillmentModel.updateMany(
    { status: 'inspected', hasDiscrepancy: false },
    { $set: { status: 'accepted' } },
  );

  await VendorFulfillmentModel.updateMany(
    { status: 'inspected', hasDiscrepancy: true },
    { $set: { status: 'partially_accepted' } },
  );

  const missingLinks = await VendorFulfillmentModel.find({
    $or: [{ vendorOrderId: null }, { vendorOrderId: { $exists: false } }],
  }).select('_id orderId storeId');

  for (const row of missingLinks) {
    const vendorOrder = await VendorOrderModel.findOne({
      parentOrderId: row.orderId,
      storeId: row.storeId,
    }).select('_id');

    if (!vendorOrder) {
      continue;
    }

    await VendorFulfillmentModel.updateOne(
      { _id: row._id, vendorOrderId: null },
      { $set: { vendorOrderId: vendorOrder._id } },
    );
  }
};
