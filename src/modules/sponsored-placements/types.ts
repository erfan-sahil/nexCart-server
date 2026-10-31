import type { SPONSORED_SECTIONS, SPONSORED_SLOTS } from './constants';

export type SponsoredSlot = (typeof SPONSORED_SLOTS)[number];

export type SponsoredSection = (typeof SPONSORED_SECTIONS)[number];

export type SponsoredPromoDto = {
  slot: SponsoredSlot;
  section: SponsoredSection;
  eyebrow: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  href: string;
  image: string;
  productName: string;
  price: number;
  originalPrice?: number;
};

export type SponsoredPlacementManageDto = {
  slot: SponsoredSlot;
  productId: string | null;
  productName: string;
  section: SponsoredSection | null;
  title: string;
  subtitle: string;
  ctaLabel: string;
  image: string;
  isActive: boolean;
};
