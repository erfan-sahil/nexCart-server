import { randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import { env } from '../../config/env';
import { deliveryFeeFor, siteSettingsService } from '../site-settings/site-settings.service';
import { ProductModel } from '../products/product.model';
import { ProductVariantModel } from '../products/product-variant.model';
import { isStoreListed, StoreModel } from '../stores/store.model';
import {
  MAX_ORDER_LINES,
  MAX_ORDER_LINE_QUANTITY,
  ORDER_CURRENCY,
  type OrderPaymentMethod,
} from './constants';
import type { OrderItemDto, OrderQuoteDto, OrderTotalsDto } from './types';
import { AppError } from '../../common/errors/AppError';

export type CheckoutLineInput = {
  variantId: string;
  quantity: number;
};

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const currentPriceFor = (
  price: number,
  discountType: 'percent' | 'amount' | null,
  discountValue: number | null,
) => {
  if (!discountType || discountValue === null) {
    return money(price);
  }

  if (discountType === 'percent') {
    return money(price * (1 - discountValue / 100));
  }

  return money(price - discountValue);
};

const isListedProduct = (product: {
  status: string;
  isPublished: boolean;
  approvalStatus: string;
}) => product.approvalStatus === 'approved' && product.status === 'active' && product.isPublished;

export const buildOrderNumber = () => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = randomBytes(3).toString('hex').toUpperCase();

  return `NC${date}${suffix}`;
};

export const buildTotals = async (
  paymentMethod: OrderPaymentMethod,
  itemsSubtotal: number,
): Promise<OrderTotalsDto> => {
  const settings = await siteSettingsService.get();
  const deliveryFee = deliveryFeeFor(itemsSubtotal, settings);
  const subtotal = money(itemsSubtotal);
  const grandTotal = money(subtotal + deliveryFee);
  const amountDueNow = paymentMethod === 'prepaid' ? grandTotal : deliveryFee;

  return {
    itemsSubtotal: subtotal,
    deliveryFee,
    grandTotal,
    amountDueNow,
    amountPaid: 0,
    balanceDue: paymentMethod === 'prepaid' ? 0 : subtotal,
    refundableAmount: 0,
    currency: env.ORDER_CURRENCY || ORDER_CURRENCY,
  };
};

type ResolvedLine = OrderItemDto & {
  productObjectId: Types.ObjectId;
  variantObjectId: Types.ObjectId;
  storeObjectId: Types.ObjectId;
};

export const resolveCheckoutLines = async (lines: CheckoutLineInput[]): Promise<ResolvedLine[]> => {
  if (lines.length === 0) {
    throw AppError.validation('Add at least one item to checkout');
  }

  if (lines.length > MAX_ORDER_LINES) {
    throw AppError.validation(`An order cannot have more than ${MAX_ORDER_LINES} lines`);
  }

  const seenVariants = new Set<string>();
  const normalized = lines.map((line) => {
    if (!Types.ObjectId.isValid(line.variantId)) {
      throw AppError.validation('One or more items are invalid');
    }

    if (seenVariants.has(line.variantId)) {
      throw AppError.validation('Each variant can only appear once in an order');
    }

    seenVariants.add(line.variantId);

    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      throw AppError.validation('Quantity must be a whole number greater than 0');
    }

    if (line.quantity > MAX_ORDER_LINE_QUANTITY) {
      throw AppError.validation(`Quantity cannot be more than ${MAX_ORDER_LINE_QUANTITY}`);
    }

    return line;
  });

  const sorted = [...normalized].sort((left, right) =>
    left.variantId.localeCompare(right.variantId),
  );
  const resolved: ResolvedLine[] = [];

  for (const line of sorted) {
    const variant = await ProductVariantModel.findById(line.variantId).select(
      'sku price discountType discountValue stock status productId',
    );

    if (!variant || variant.status !== 'active') {
      throw AppError.validation('One or more items are no longer available');
    }

    if (variant.stock < line.quantity) {
      throw AppError.validation(`Not enough stock for SKU ${variant.sku}`);
    }

    const product = await ProductModel.findById(variant.productId).select(
      'name storeId status isPublished approvalStatus',
    );

    if (!product || !isListedProduct(product)) {
      throw AppError.validation('One or more items are no longer available');
    }

    const store = await StoreModel.findById(product.storeId).select('name isActive suspendedAt');

    if (!isStoreListed(store)) {
      throw AppError.validation('One or more items are no longer available');
    }

    const unitPrice = currentPriceFor(
      variant.price,
      variant.discountType === 'percent' || variant.discountType === 'amount'
        ? variant.discountType
        : null,
      variant.discountValue ?? null,
    );

    resolved.push({
      variantId: String(variant._id),
      productId: String(product._id),
      storeId: String(store!._id),
      productName: product.name,
      storeName: store!.name,
      sku: variant.sku,
      quantity: line.quantity,
      unitPrice,
      lineTotal: money(unitPrice * line.quantity),
      productObjectId: product._id,
      variantObjectId: variant._id,
      storeObjectId: store!._id,
    });
  }

  return resolved;
};

export const quoteCheckout = async (input: {
  paymentMethod: OrderPaymentMethod;
  items: CheckoutLineInput[];
}): Promise<OrderQuoteDto> => {
  const resolved = await resolveCheckoutLines(input.items);
  const itemsSubtotal = money(resolved.reduce((sum, line) => sum + line.lineTotal, 0));

  return {
    paymentMethod: input.paymentMethod,
    items: resolved.map(
      ({ productObjectId: _p, variantObjectId: _v, storeObjectId: _s, ...item }) => item,
    ),
    totals: await buildTotals(input.paymentMethod, itemsSubtotal),
  };
};

export type { ResolvedLine };
