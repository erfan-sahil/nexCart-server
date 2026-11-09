import { categorySeed, type CategorySeed } from './categorySeed';

/** Shared password for every mock account (admin, vendors, customers). Local/demo use only. */
export const DEMO_PASSWORD = 'NexCart@123';
export const DEMO_EMAIL_DOMAIN = 'nexcart.local';

export const ADMIN_SEED = {
  email: `admin@${DEMO_EMAIL_DOMAIN}`,
  firstName: 'Nex',
  lastName: 'Admin',
  phone: '+8801700000001',
} as const;

const photo = (id: string, size = 'w=1600&q=80') =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&${size}`;

const square = (id: string) => photo(id, 'w=320&h=320&q=80');

/* -------------------------------------------------------------------------- */
/* Stores (one vendor per root category)                                      */
/* -------------------------------------------------------------------------- */

export type StoreSeed = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  name: string;
  slug: string;
  description: string;
  logo: string;
  banner: string;
  city: string;
  /** Root category slugs this store sells in. */
  rootSlugs: string[];
  joinedDaysAgo: number;
  returnPolicy: string;
  shippingPolicy: string;
};

const RETURN_POLICY =
  'Free returns within 7 days of delivery for unused items in original packaging.';
const SHIPPING_POLICY =
  'Orders ship within 1 business day. Delivery takes 2-4 days inside Dhaka and 3-6 days nationwide.';

export const storeSeed: StoreSeed[] = [
  {
    email: `technest@${DEMO_EMAIL_DOMAIN}`,
    firstName: 'Tanvir',
    lastName: 'Rahman',
    phone: '+8801710000001',
    name: 'TechNest',
    slug: 'technest',
    description:
      'Authorised reseller of phones, laptops, audio and smart home gear. Every device ships with a local warranty.',
    logo: square('photo-1518770660439-4636190af475'),
    banner: photo('photo-1498049794561-7780e7231661'),
    city: 'Dhaka',
    rootSlugs: ['electronics'],
    joinedDaysAgo: 540,
    returnPolicy: RETURN_POLICY,
    shippingPolicy: SHIPPING_POLICY,
  },
  {
    email: `urbanthread@${DEMO_EMAIL_DOMAIN}`,
    firstName: 'Nusrat',
    lastName: 'Jahan',
    phone: '+8801710000002',
    name: 'Urban Thread',
    slug: 'urban-thread',
    description:
      'Contemporary fashion for women and men: small-batch dresses, tailoring, footwear and accessories.',
    logo: square('photo-1441986300917-64674bd600d8'),
    banner: photo('photo-1483985988355-763728e1935b'),
    city: 'Chattogram',
    rootSlugs: ['fashion'],
    joinedDaysAgo: 470,
    returnPolicy: RETURN_POLICY,
    shippingPolicy: SHIPPING_POLICY,
  },
  {
    email: `loftandhome@${DEMO_EMAIL_DOMAIN}`,
    firstName: 'Imran',
    lastName: 'Hossain',
    phone: '+8801710000003',
    name: 'Loft & Home',
    slug: 'loft-and-home',
    description:
      'Furniture, bedding, lighting and kitchen essentials designed to make small spaces feel generous.',
    logo: square('photo-1556228453-efd6c1ff04f6'),
    banner: photo('photo-1555041469-a586c61ea9bc'),
    city: 'Dhaka',
    rootSlugs: ['home'],
    joinedDaysAgo: 420,
    returnPolicy: RETURN_POLICY,
    shippingPolicy: SHIPPING_POLICY,
  },
  {
    email: `glowstudio@${DEMO_EMAIL_DOMAIN}`,
    firstName: 'Farhana',
    lastName: 'Akter',
    phone: '+8801710000004',
    name: 'Glow Studio',
    slug: 'glow-studio',
    description:
      'Dermatologist-approved skincare, makeup, fragrance and haircare from trusted beauty labels.',
    logo: square('photo-1522335789203-aabd1fc54bc9'),
    banner: photo('photo-1596462502278-27bfdc403348'),
    city: 'Dhaka',
    rootSlugs: ['beauty'],
    joinedDaysAgo: 360,
    returnPolicy: 'Unopened beauty products can be returned within 7 days of delivery.',
    shippingPolicy: SHIPPING_POLICY,
  },
  {
    email: `trailhead@${DEMO_EMAIL_DOMAIN}`,
    firstName: 'Sabbir',
    lastName: 'Ahmed',
    phone: '+8801710000005',
    name: 'Trailhead Sports',
    slug: 'trailhead-sports',
    description:
      'Fitness gear, camping equipment, bikes and team sports kit for weekend athletes and everyday movers.',
    logo: square('photo-1517649763962-0c623066013b'),
    banner: photo('photo-1517836357463-d25dfeac3438'),
    city: 'Sylhet',
    rootSlugs: ['sports'],
    joinedDaysAgo: 300,
    returnPolicy: RETURN_POLICY,
    shippingPolicy: SHIPPING_POLICY,
  },
  {
    email: `greenbasket@${DEMO_EMAIL_DOMAIN}`,
    firstName: 'Mitu',
    lastName: 'Sarker',
    phone: '+8801710000006',
    name: 'Green Basket',
    slug: 'green-basket',
    description:
      'Fresh pantry staples, snacks, specialty coffee and household basics delivered to your door.',
    logo: square('photo-1488459716781-31db52582fe9'),
    banner: photo('photo-1542838132-92c53300491e'),
    city: 'Dhaka',
    rootSlugs: ['grocery'],
    joinedDaysAgo: 250,
    returnPolicy: 'Damaged or incorrect grocery items are refunded within 48 hours of delivery.',
    shippingPolicy: 'Same-day delivery in Dhaka for orders placed before 2 PM.',
  },
  {
    email: `autopro@${DEMO_EMAIL_DOMAIN}`,
    firstName: 'Rafiq',
    lastName: 'Islam',
    phone: '+8801710000007',
    name: 'AutoPro Garage',
    slug: 'autopro-garage',
    description:
      'Car care kits, genuine spare parts and cabin accessories chosen by working mechanics.',
    logo: square('photo-1503376780353-7e6692767b70'),
    banner: photo('photo-1492144534655-ae79c964c9d7'),
    city: 'Khulna',
    rootSlugs: ['automotive'],
    joinedDaysAgo: 200,
    returnPolicy: 'Parts can be returned within 7 days if uninstalled and unused.',
    shippingPolicy: SHIPPING_POLICY,
  },
  {
    email: `pageturner@${DEMO_EMAIL_DOMAIN}`,
    firstName: 'Shirin',
    lastName: 'Chowdhury',
    phone: '+8801710000008',
    name: 'Page Turner Books',
    slug: 'page-turner-books',
    description:
      'Fiction, non-fiction, children\u2019s picture books and beautiful stationery for curious minds.',
    logo: square('photo-1521587760476-6c12a4b040da'),
    banner: photo('photo-1512820790803-83ca734da794'),
    city: 'Rajshahi',
    rootSlugs: ['books'],
    joinedDaysAgo: 160,
    returnPolicy: RETURN_POLICY,
    shippingPolicy: SHIPPING_POLICY,
  },
];

/** Maps every category slug to its root slug (e.g. `iphones` -> `electronics`). */
const buildRootIndex = () => {
  const index = new Map<string, string>();

  const walk = (node: CategorySeed, root: string) => {
    index.set(node.slug, root);
    node.children?.forEach((child) => walk(child, root));
  };

  categorySeed.forEach((root) => walk(root, root.slug));

  return index;
};

const rootIndex = buildRootIndex();

export const rootSlugOf = (categorySlug: string) => rootIndex.get(categorySlug);

export const featuredRootSlugs = categorySeed.map((root) => root.slug);

/* -------------------------------------------------------------------------- */
/* Customers                                                                  */
/* -------------------------------------------------------------------------- */

export type CustomerSeed = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  state: string;
  postalCode: string;
};

const customer = (
  index: number,
  firstName: string,
  lastName: string,
  city: string,
  state: string,
  postalCode: string,
): CustomerSeed => ({
  email: `${firstName}.${lastName}@${DEMO_EMAIL_DOMAIN}`.toLowerCase(),
  firstName,
  lastName,
  phone: `+88017200000${String(index).padStart(2, '0')}`,
  city,
  state,
  postalCode,
});

export const customerSeed: CustomerSeed[] = [
  customer(1, 'Ayesha', 'Siddique', 'Dhaka', 'Dhaka', '1212'),
  customer(2, 'Rahim', 'Uddin', 'Chattogram', 'Chattogram', '4000'),
  customer(3, 'Tasnim', 'Khan', 'Dhaka', 'Dhaka', '1205'),
  customer(4, 'Karim', 'Mia', 'Sylhet', 'Sylhet', '3100'),
  customer(5, 'Sadia', 'Parvin', 'Rajshahi', 'Rajshahi', '6000'),
  customer(6, 'Mahin', 'Chowdhury', 'Dhaka', 'Dhaka', '1229'),
  customer(7, 'Lamia', 'Haque', 'Khulna', 'Khulna', '9000'),
  customer(8, 'Zubair', 'Alam', 'Dhaka', 'Dhaka', '1216'),
  customer(9, 'Nabila', 'Sultana', 'Barishal', 'Barishal', '8200'),
  customer(10, 'Fahim', 'Reza', 'Dhaka', 'Dhaka', '1207'),
  customer(11, 'Priya', 'Das', 'Cumilla', 'Chattogram', '3500'),
  customer(12, 'Arif', 'Hasan', 'Dhaka', 'Dhaka', '1230'),
];

/* -------------------------------------------------------------------------- */
/* Homepage hero                                                              */
/* -------------------------------------------------------------------------- */

export const heroSeed = [
  {
    eyebrow: 'Multi-vendor marketplace',
    title: 'Everything you need, shipped from stores you trust.',
    description:
      'Thousands of products from verified independent sellers, one fast checkout and deals that actually move.',
    image: photo('photo-1567401893414-76b7b1e5a7a5'),
    isActive: true,
  },
  {
    eyebrow: 'Electronics week',
    title: 'Pro gear from specialist vendors, up to 35% off.',
    description:
      'Headphones, laptops, cameras and smart home kits from verified tech stores, with local warranty.',
    image: photo('photo-1505740420928-5e560c06d30e'),
    isActive: true,
  },
  {
    eyebrow: 'New season',
    title: 'Fresh drops from independent fashion houses.',
    description:
      'Limited runs, real makers and styles you will not find in a big-box feed. New pieces land every week.',
    image: photo('photo-1490481651871-ab68de25d43d'),
    isActive: true,
  },
  {
    eyebrow: 'Home refresh',
    title: 'Make every room feel new for less.',
    description: 'Sofas, lighting, bedding and kitchen essentials from design-led home stores.',
    image: photo('photo-1616486338812-3dadae4b4ace'),
    isActive: false,
  },
  {
    eyebrow: 'Eid specials',
    title: 'Gift guides, free delivery and festive bundles.',
    description:
      'Spoil someone special with curated gifts across beauty, fashion and gadgets. Seasonal offers end soon.',
    image: photo('photo-1513885535751-8b9238bd345a'),
    isActive: false,
  },
];

/* -------------------------------------------------------------------------- */
/* Flash deals                                                                */
/* -------------------------------------------------------------------------- */

const HOUR_MS = 60 * 60 * 1000;

export type FlashCampaignSeed = {
  name: string;
  /** Offsets from "now" in hours. */
  startsInHours: number;
  endsInHours: number;
  isEnabled: boolean;
  items: Array<{ slug: string; percent: number }>;
};

export const FLASH_SECTION_TITLE = 'Flash deals';

export const flashCampaignSeed: FlashCampaignSeed[] = [
  {
    name: 'Weekend Flash Sale',
    startsInHours: -2,
    endsInHours: 72,
    isEnabled: true,
    items: [
      { slug: 'harbor-anc-headphones', percent: 30 },
      { slug: 'court-runner-sneakers', percent: 25 },
      { slug: 'pebble-buds', percent: 35 },
      { slug: 'arc-floor-lamp', percent: 20 },
      { slug: 'daily-vitamin-c-serum', percent: 28 },
      { slug: 'adjustable-dumbbells', percent: 18 },
      { slug: 'single-origin-coffee', percent: 15 },
      { slug: 'linen-day-dress', percent: 22 },
    ],
  },
  {
    name: 'Midnight Mega Deals',
    startsInHours: 84,
    endsInHours: 132,
    isEnabled: true,
    items: [
      { slug: 'aerobook-14', percent: 12 },
      { slug: 'cloud-sectional-sofa', percent: 15 },
      { slug: 'city-hybrid-bike', percent: 14 },
      { slug: 'cedar-eau-de-parfum', percent: 25 },
      { slug: 'trail-tent-2', percent: 20 },
    ],
  },
  {
    name: 'Clearance Weekend',
    startsInHours: -24 * 20,
    endsInHours: -24 * 18,
    isEnabled: true,
    items: [
      { slug: 'oxford-shirt', percent: 30 },
      { slug: 'percale-sheet-set', percent: 25 },
      { slug: 'match-football', percent: 20 },
      { slug: 'clothbound-notebook', percent: 25 },
    ],
  },
];

export const flashWindow = (campaign: FlashCampaignSeed, now = Date.now()) => ({
  startsAt: new Date(now + campaign.startsInHours * HOUR_MS),
  endsAt: new Date(now + campaign.endsInHours * HOUR_MS),
});

/* -------------------------------------------------------------------------- */
/* Sponsored placements                                                       */
/* -------------------------------------------------------------------------- */

export const sponsoredSeed = [
  {
    slot: '1' as const,
    section: 'top-selling' as const,
    productSlug: 'pulse-a14-android',
    title: 'Big battery. Small price.',
    subtitle: 'The Pulse A14 delivers two-day battery life and a crisp display for less.',
    ctaLabel: 'Grab the deal',
  },
  {
    slot: '2' as const,
    section: 'new-arrivals' as const,
    productSlug: 'cloud-sectional-sofa',
    title: 'Cloud-soft seating, just landed',
    subtitle: 'Modular sectional with washable covers. Limited first run.',
    ctaLabel: 'Shop this drop',
  },
];

/* -------------------------------------------------------------------------- */
/* Coupons                                                                    */
/* -------------------------------------------------------------------------- */

const DAY_MS = 24 * HOUR_MS;

export const couponSeed = [
  {
    code: 'WELCOME10',
    label: '10% off your first order',
    discountType: 'percent' as const,
    discountValue: 10,
    minimumSubtotal: 30,
    startsInDays: -30,
    endsInDays: 180,
    usageLimit: null,
    perCustomerLimit: 1,
    usedCount: 42,
    isEnabled: true,
  },
  {
    code: 'SAVE20',
    label: '$20 off orders over $150',
    discountType: 'amount' as const,
    discountValue: 20,
    minimumSubtotal: 150,
    startsInDays: -10,
    endsInDays: 60,
    usageLimit: 500,
    perCustomerLimit: 2,
    usedCount: 87,
    isEnabled: true,
  },
  {
    code: 'FLASH15',
    label: '15% off during flash week',
    discountType: 'percent' as const,
    discountValue: 15,
    minimumSubtotal: 75,
    startsInDays: -1,
    endsInDays: 6,
    usageLimit: 250,
    perCustomerLimit: 1,
    usedCount: 18,
    isEnabled: true,
  },
  {
    code: 'SUMMER25',
    label: 'Summer sale (ended)',
    discountType: 'percent' as const,
    discountValue: 25,
    minimumSubtotal: 100,
    startsInDays: -120,
    endsInDays: -60,
    usageLimit: 300,
    perCustomerLimit: 1,
    usedCount: 211,
    isEnabled: true,
  },
  {
    code: 'BIGSALE30',
    label: '30% off storewide (upcoming)',
    discountType: 'percent' as const,
    discountValue: 30,
    minimumSubtotal: 200,
    startsInDays: 20,
    endsInDays: 27,
    usageLimit: 1000,
    perCustomerLimit: 1,
    usedCount: 0,
    isEnabled: true,
  },
  {
    code: 'VIP5',
    label: '$5 off any order (paused)',
    discountType: 'amount' as const,
    discountValue: 5,
    minimumSubtotal: 0,
    startsInDays: -15,
    endsInDays: 90,
    usageLimit: null,
    perCustomerLimit: 3,
    usedCount: 6,
    isEnabled: false,
  },
];

export const couponWindow = (coupon: (typeof couponSeed)[number], now = Date.now()) => ({
  startsAt: new Date(now + coupon.startsInDays * DAY_MS),
  endsAt: new Date(now + coupon.endsInDays * DAY_MS),
});

/* -------------------------------------------------------------------------- */
/* Site settings                                                              */
/* -------------------------------------------------------------------------- */

export const siteSettingsSeed = {
  deliveryFee: 8,
  freeDeliveryEnabled: true,
  freeDeliveryMinAmount: 120,
  defaultCommissionRate: 10,
  settlementHoldDays: 7,
} as const;

/* -------------------------------------------------------------------------- */
/* Reviews                                                                    */
/* -------------------------------------------------------------------------- */

export const reviewBodies: Record<1 | 2 | 3 | 4 | 5, string[]> = {
  5: [
    'Absolutely love the {product}. Exactly as described and arrived earlier than expected.',
    'Superb quality for the price. I have already recommended the {product} to friends.',
    'Packaging was perfect and the {product} works flawlessly. Five stars from me.',
    'Better than I hoped. The {product} feels premium and the seller answered my questions fast.',
    'Worth every taka. Would happily buy the {product} again.',
  ],
  4: [
    'Really good {product}. Small nitpicks on packaging but the product itself is great.',
    'Solid purchase. The {product} does what it promises and delivery was quick.',
    'Happy with the {product}. Would be perfect with a slightly longer warranty.',
    'Good value overall. The {product} met my expectations and the seller was responsive.',
  ],
  3: [
    'The {product} is okay. Does the job but nothing special for the price.',
    'Average experience. The {product} works, though delivery took longer than quoted.',
    'Decent but not perfect. The {product} looks different from the photos in some lighting.',
  ],
  2: [
    'Disappointed with the {product}. Quality felt below what the listing suggested.',
    'The {product} arrived with minor issues. Support helped but it was a hassle.',
  ],
  1: ['The {product} did not match the description at all. Had to request a return.'],
};

export const vendorReplies = [
  'Thank you for the kind words! We are glad you enjoy it and look forward to serving you again.',
  'Thanks for the feedback. We have shared your note with our packaging team to keep improving.',
  'We are sorry the experience fell short. Please message us so we can make this right.',
  'Appreciate the review! Let us know if you need any help getting the most out of your purchase.',
];

/* -------------------------------------------------------------------------- */
/* Deterministic randomness                                                   */
/* -------------------------------------------------------------------------- */

/** Small seeded PRNG so reruns generate identical mock data. */
export const createRng = (seedText: string) => {
  let hash = 1779033703 ^ seedText.length;

  for (let index = 0; index < seedText.length; index += 1) {
    hash = Math.imul(hash ^ seedText.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }

  let state = hash >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};
