import { Types, type FilterQuery } from 'mongoose';
import { CouponModel, type Coupon } from './coupon.model';
import { couponDiscountFromSubtotal, money } from './coupon-pricing';
import type { CouponDto, ResolvedCheckoutCoupon } from './types';
import { AppError } from '../../common/errors/AppError';
import { isDuplicateKeyError } from '../../common/errors/mongoError';
import { OrderModel } from '../orders/order.model';
import type {
  CreateCouponInput,
  ListCouponsQuery,
  SetCouponEnabledInput,
  UpdateCouponInput,
} from './coupon.validator';

const normalizeCode = (code: string) => code.trim().toUpperCase();

const toDto = (coupon: Coupon): CouponDto => ({
  id: String(coupon._id),
  code: coupon.code,
  label: coupon.label ?? '',
  discountType: coupon.discountType,
  discountValue: coupon.discountValue,
  minimumSubtotal: coupon.minimumSubtotal,
  startsAt: coupon.startsAt.toISOString(),
  endsAt: coupon.endsAt.toISOString(),
  usageLimit: coupon.usageLimit ?? null,
  perCustomerLimit: coupon.perCustomerLimit,
  usedCount: coupon.usedCount,
  isEnabled: coupon.isEnabled,
  createdAt: coupon.createdAt.toISOString(),
  updatedAt: coupon.updatedAt.toISOString(),
});

const assertDiscountValue = (discountType: Coupon['discountType'], discountValue: number) => {
  if (discountType === 'percent' && discountValue > 100) {
    throw AppError.validation('Percent discount cannot exceed 100');
  }
};

const assertWindow = (startsAt: Date, endsAt: Date) => {
  if (endsAt <= startsAt) {
    throw AppError.validation('End time must be after start time');
  }
};

const couponIsActiveNow = (
  coupon: Pick<Coupon, 'isEnabled' | 'startsAt' | 'endsAt'>,
  now: Date,
) => {
  if (!coupon.isEnabled) {
    return false;
  }

  return coupon.startsAt <= now && coupon.endsAt > now;
};

const customerUsageCount = async (couponId: Types.ObjectId, customerId: string) =>
  OrderModel.countDocuments({
    customerId: new Types.ObjectId(customerId),
    couponId,
    status: { $ne: 'expired' },
  });

const loadCouponByCode = async (code: string) => {
  const normalized = normalizeCode(code);
  const coupon = await CouponModel.findOne({ code: normalized });

  if (!coupon) {
    throw AppError.validation('This coupon code is not valid');
  }

  return coupon;
};

const validateCouponForCheckout = async (
  coupon: Coupon,
  itemsSubtotal: number,
  customerId: string | undefined,
  now = new Date(),
): Promise<ResolvedCheckoutCoupon> => {
  if (!couponIsActiveNow(coupon, now)) {
    throw AppError.validation('This coupon is not active');
  }

  const subtotal = money(itemsSubtotal);

  if (subtotal < coupon.minimumSubtotal) {
    throw AppError.validation(
      `Order subtotal must be at least ${coupon.minimumSubtotal} to use this coupon`,
    );
  }

  if (
    coupon.usageLimit !== null &&
    coupon.usageLimit !== undefined &&
    coupon.usedCount >= coupon.usageLimit
  ) {
    throw AppError.validation('This coupon has reached its usage limit');
  }

  if (customerId) {
    const usedByCustomer = await customerUsageCount(coupon._id, customerId);

    if (usedByCustomer >= coupon.perCustomerLimit) {
      throw AppError.validation('You have already used this coupon');
    }
  }

  const couponDiscount = couponDiscountFromSubtotal(
    subtotal,
    coupon.discountType,
    coupon.discountValue,
  );

  if (couponDiscount <= 0) {
    throw AppError.validation('This coupon does not apply to your order');
  }

  return {
    couponId: String(coupon._id),
    couponCode: coupon.code,
    couponDiscount,
  };
};

export const couponService = {
  async list(query: ListCouponsQuery) {
    const filter: FilterQuery<Coupon> = {};

    if (query.enabled === 'enabled') {
      filter.isEnabled = true;
    } else if (query.enabled === 'disabled') {
      filter.isEnabled = false;
    }

    if (query.search) {
      const pattern = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { code: { $regex: pattern, $options: 'i' } },
        { label: { $regex: pattern, $options: 'i' } },
      ];
    }

    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
      CouponModel.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(query.limit),
      CouponModel.countDocuments(filter),
    ]);

    return {
      items: items.map(toDto),
      page: query.page,
      limit: query.limit,
      total,
    };
  },

  async create(input: CreateCouponInput): Promise<CouponDto> {
    assertDiscountValue(input.discountType, input.discountValue);
    assertWindow(input.startsAt, input.endsAt);

    try {
      const coupon = await CouponModel.create({
        code: input.code,
        label: input.label ?? '',
        discountType: input.discountType,
        discountValue: input.discountValue,
        minimumSubtotal: input.minimumSubtotal,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        usageLimit: input.usageLimit,
        perCustomerLimit: input.perCustomerLimit,
        usedCount: 0,
        isEnabled: input.isEnabled,
      });

      return toDto(coupon);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw AppError.validation('A coupon with this code already exists');
      }

      throw error;
    }
  },

  async update(id: string, input: UpdateCouponInput): Promise<CouponDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw AppError.notFound('Coupon not found');
    }

    const coupon = await CouponModel.findById(id);

    if (!coupon) {
      throw AppError.notFound('Coupon not found');
    }

    const discountType = input.discountType ?? coupon.discountType;
    const discountValue = input.discountValue ?? coupon.discountValue;
    assertDiscountValue(discountType, discountValue);

    const startsAt = input.startsAt ?? coupon.startsAt;
    const endsAt = input.endsAt ?? coupon.endsAt;
    assertWindow(startsAt, endsAt);

    if (input.code !== undefined) {
      coupon.code = input.code;
    }

    if (input.label !== undefined) {
      coupon.label = input.label;
    }

    if (input.discountType !== undefined) {
      coupon.discountType = input.discountType;
    }

    if (input.discountValue !== undefined) {
      coupon.discountValue = input.discountValue;
    }

    if (input.minimumSubtotal !== undefined) {
      coupon.minimumSubtotal = input.minimumSubtotal;
    }

    if (input.startsAt !== undefined) {
      coupon.startsAt = input.startsAt;
    }

    if (input.endsAt !== undefined) {
      coupon.endsAt = input.endsAt;
    }

    if (input.usageLimit !== undefined) {
      coupon.usageLimit = input.usageLimit;
    }

    if (input.perCustomerLimit !== undefined) {
      coupon.perCustomerLimit = input.perCustomerLimit;
    }

    if (input.isEnabled !== undefined) {
      coupon.isEnabled = input.isEnabled;
    }

    try {
      await coupon.save();
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw AppError.validation('A coupon with this code already exists');
      }

      throw error;
    }

    return toDto(coupon);
  },

  async setEnabled(id: string, input: SetCouponEnabledInput): Promise<CouponDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw AppError.notFound('Coupon not found');
    }

    const coupon = await CouponModel.findByIdAndUpdate(
      id,
      { $set: { isEnabled: input.isEnabled } },
      { new: true },
    );

    if (!coupon) {
      throw AppError.notFound('Coupon not found');
    }

    return toDto(coupon);
  },

  async resolveForCheckout(input: {
    couponCode?: string;
    itemsSubtotal: number;
    customerId?: string;
  }): Promise<ResolvedCheckoutCoupon | null> {
    const raw = input.couponCode?.trim();

    if (!raw) {
      return null;
    }

    const coupon = await loadCouponByCode(raw);
    return validateCouponForCheckout(coupon, input.itemsSubtotal, input.customerId);
  },

  async consumeUse(couponId: string): Promise<void> {
    if (!Types.ObjectId.isValid(couponId)) {
      throw AppError.validation('This coupon code is not valid');
    }

    const objectId = new Types.ObjectId(couponId);
    const coupon = await CouponModel.findById(objectId).select('usageLimit usedCount');

    if (!coupon) {
      throw AppError.validation('This coupon code is not valid');
    }

    const filter =
      coupon.usageLimit !== null && coupon.usageLimit !== undefined
        ? { _id: objectId, usedCount: { $lt: coupon.usageLimit } }
        : { _id: objectId };

    const updated = await CouponModel.findOneAndUpdate(filter, { $inc: { usedCount: 1 } });

    if (!updated) {
      throw AppError.validation('This coupon has reached its usage limit');
    }
  },

  async releaseUse(couponId: Types.ObjectId | undefined | null): Promise<void> {
    if (!couponId) {
      return;
    }

    await CouponModel.updateOne(
      { _id: couponId, usedCount: { $gt: 0 } },
      { $inc: { usedCount: -1 } },
    );
  },
};
