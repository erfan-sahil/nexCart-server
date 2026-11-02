import { LedgerEntryModel } from '../wallet/ledger-entry.model';
import { VendorOrderModel } from '../orders/vendor-order.model';
import { OrderModel } from '../orders/order.model';

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const financeReportService = {
  async summary() {
    const [gmvRows, commissionRows, codOutstanding] = await Promise.all([
      VendorOrderModel.aggregate<{ total: number }>([
        { $match: { commissionRate: { $ne: null } } },
        { $group: { _id: null, total: { $sum: '$itemsSubtotal' } } },
      ]),
      VendorOrderModel.aggregate<{ total: number }>([
        { $match: { commissionAmount: { $ne: null } } },
        { $group: { _id: null, total: { $sum: '$commissionAmount' } } },
      ]),
      OrderModel.countDocuments({
        paymentMethod: 'cod',
        codRemittanceStatus: { $in: ['expected', 'collected', 'remitted', 'short'] },
      }),
    ]);

    const ledgerCommission = await LedgerEntryModel.aggregate<{ total: number }>([
      { $match: { type: 'commission_debit' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    return {
      gmvFromVendorOrders: money(gmvRows[0]?.total ?? 0),
      commissionFromSnapshots: money(commissionRows[0]?.total ?? 0),
      commissionFromLedger: money(ledgerCommission[0]?.total ?? 0),
      codOrdersOutstanding: codOutstanding,
    };
  },
};
