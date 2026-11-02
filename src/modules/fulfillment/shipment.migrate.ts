import { ShipmentModel } from './shipment.model';

export const migrateShipmentStatuses = async () => {
  await ShipmentModel.updateMany({ status: 'awaiting_items' }, { $set: { status: 'pending' } });
  await ShipmentModel.updateMany({ status: 'ready_to_pack' }, { $set: { status: 'packed' } });
  await ShipmentModel.updateMany({ status: 'shipped' }, { $set: { status: 'dispatched' } });
};
