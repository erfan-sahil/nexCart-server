const photo = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=80`;

export type CategorySeed = {
  name: string;
  slug: string;
  description: string;
  image: string;
  popular?: boolean;
  children?: CategorySeed[];
};

export const categorySeed: CategorySeed[] = [
  {
    name: 'Electronics',
    slug: 'electronics',
    description: 'Phones, laptops, audio, and smart home gear from verified tech stores.',
    image: photo('photo-1498049794561-7780e7231661'),
    children: [
      {
        name: 'Smartphones',
        slug: 'smartphones',
        description: 'Unlocked phones and flagship models.',
        image: photo('photo-1511707171634-5f897ff02aa9'),
        popular: true,
        children: [
          {
            name: 'Android phones',
            slug: 'android-phones',
            description: 'Android smartphones from major makers.',
            image: photo('photo-1511707171634-5f897ff02aa9'),
          },
          {
            name: 'iPhones',
            slug: 'iphones',
            description: 'Current and previous iPhone models.',
            image: photo('photo-1510557880182-3d4d3cba35a5'),
          },
        ],
      },
      {
        name: 'Laptops',
        slug: 'laptops',
        description: 'Everyday and pro laptops.',
        image: photo('photo-1496181133206-80ce9b88a853'),
        popular: true,
      },
      {
        name: 'Headphones',
        slug: 'headphones',
        description: 'Earbuds and over-ear headphones.',
        image: photo('photo-1505740420928-5e560c06d30e'),
      },
      {
        name: 'Cameras',
        slug: 'cameras',
        description: 'Mirrorless cameras and lenses.',
        image: photo('photo-1516035069371-29a1b244cc32'),
      },
      {
        name: 'Gaming',
        slug: 'gaming',
        description: 'Consoles, headsets, and accessories.',
        image: photo('photo-1606144042614-b2417e99c4e3'),
        popular: true,
      },
      {
        name: 'Smart home',
        slug: 'smart-home',
        description: 'Speakers, lights, and hubs.',
        image: photo('photo-1558002038-1055907df827'),
      },
    ],
  },
  {
    name: 'Fashion',
    slug: 'fashion',
    description: 'Apparel, shoes, and accessories from independent labels.',
    image: photo('photo-1483985988355-763728e1935b'),
    children: [
      {
        name: 'Women',
        slug: 'women',
        description: 'Women’s clothing and accessories.',
        image: photo('photo-1483985988355-763728e1935b'),
        popular: true,
        children: [
          {
            name: 'Dresses',
            slug: 'dresses',
            description: 'Day dresses and occasion wear.',
            image: photo('photo-1490481651871-ab68de25d43d'),
          },
          {
            name: 'Outerwear',
            slug: 'outerwear',
            description: 'Coats and jackets.',
            image: photo('photo-1539533018447-63fcce2678e3'),
          },
        ],
      },
      {
        name: 'Men',
        slug: 'men',
        description: 'Men’s clothing and accessories.',
        image: photo('photo-1617137968427-85924c800a22'),
      },
      {
        name: 'Shoes',
        slug: 'shoes',
        description: 'Sneakers, boots, and sandals.',
        image: photo('photo-1542291026-7eec264c27ff'),
        popular: true,
      },
      {
        name: 'Bags',
        slug: 'bags',
        description: 'Totes, backpacks, and handbags.',
        image: photo('photo-1548036328-c9fa89d128fa'),
      },
      {
        name: 'Jewelry',
        slug: 'jewelry',
        description: 'Everyday and fine jewelry.',
        image: photo('photo-1515562141207-7a88fb7ce338'),
      },
    ],
  },
  {
    name: 'Home & Living',
    slug: 'home',
    description: 'Furniture, kitchen, and decor for every room.',
    image: photo('photo-1555041469-a586c61ea9bc'),
    children: [
      {
        name: 'Furniture',
        slug: 'furniture',
        description: 'Sofas, tables, and storage.',
        image: photo('photo-1555041469-a586c61ea9bc'),
        popular: true,
        children: [
          {
            name: 'Sofas',
            slug: 'sofas',
            description: 'Sectionals and loveseats.',
            image: photo('photo-1493663284031-b7e3aefcae8e'),
          },
          {
            name: 'Tables',
            slug: 'tables',
            description: 'Dining and coffee tables.',
            image: photo('photo-1530018607912-eff2daa1bac4'),
          },
        ],
      },
      {
        name: 'Kitchen',
        slug: 'kitchen',
        description: 'Cookware and small appliances.',
        image: photo('photo-1556911220-bff31c812dba'),
      },
      {
        name: 'Bedding',
        slug: 'bedding',
        description: 'Sheets, duvets, and pillows.',
        image: photo('photo-1505693416388-ac5ce068fe85'),
      },
      {
        name: 'Lighting',
        slug: 'lighting',
        description: 'Lamps and ceiling lights.',
        image: photo('photo-1507473885765-e6ed057f782c'),
      },
    ],
  },
  {
    name: 'Beauty',
    slug: 'beauty',
    description: 'Skincare, makeup, and fragrance.',
    image: photo('photo-1596462502278-27bfdc403348'),
    children: [
      {
        name: 'Skincare',
        slug: 'skincare',
        description: 'Cleansers, serums, and moisturizers.',
        image: photo('photo-1556228720-195a672e8a03'),
        popular: true,
      },
      {
        name: 'Makeup',
        slug: 'makeup',
        description: 'Face, eye, and lip color.',
        image: photo('photo-1522335789203-aabd1fc54bc9'),
      },
      {
        name: 'Fragrance',
        slug: 'fragrance',
        description: 'Perfume and cologne.',
        image: photo('photo-1541643600914-78b084683601'),
      },
      {
        name: 'Hair',
        slug: 'hair',
        description: 'Care and styling.',
        image: photo('photo-1522338242992-e1a54906a8da'),
      },
    ],
  },
  {
    name: 'Sports',
    slug: 'sports',
    description: 'Training gear, outdoor kit, and team sports.',
    image: photo('photo-1517836357463-d25dfeac3438'),
    children: [
      {
        name: 'Fitness',
        slug: 'fitness',
        description: 'Weights, mats, and training accessories.',
        image: photo('photo-1517836357463-d25dfeac3438'),
        popular: true,
      },
      {
        name: 'Outdoor',
        slug: 'outdoor',
        description: 'Camping and trail gear.',
        image: photo('photo-1504280390367-361c6d9f38f4'),
      },
      {
        name: 'Cycling',
        slug: 'cycling',
        description: 'Bikes and riding gear.',
        image: photo('photo-1485965120184-e220f721d03e'),
      },
      {
        name: 'Team sports',
        slug: 'team-sports',
        description: 'Balls, boots, and jerseys.',
        image: photo('photo-1579952363873-27f3bade9f55'),
      },
    ],
  },
  {
    name: 'Grocery',
    slug: 'grocery',
    description: 'Pantry staples, drinks, and household essentials.',
    image: photo('photo-1542838132-92c53300491e'),
    children: [
      {
        name: 'Pantry',
        slug: 'pantry',
        description: 'Rice, oils, and dry goods.',
        image: photo('photo-1586201375761-83865001e31c'),
      },
      {
        name: 'Snacks',
        slug: 'snacks',
        description: 'Chips, nuts, and sweets.',
        image: photo('photo-1621939514649-280e2ee25f60'),
        popular: true,
      },
      {
        name: 'Beverages',
        slug: 'beverages',
        description: 'Coffee, tea, and drinks.',
        image: photo('photo-1495474472287-4d71bcdd2085'),
      },
      {
        name: 'Household',
        slug: 'household',
        description: 'Cleaning and paper goods.',
        image: photo('photo-1563453392212-326f5e854473'),
      },
    ],
  },
  {
    name: 'Automotive',
    slug: 'automotive',
    description: 'Parts, care, and in-car accessories.',
    image: photo('photo-1492144534655-ae79c964c9d7'),
    children: [
      {
        name: 'Car care',
        slug: 'car-care',
        description: 'Wash, wax, and interior care.',
        image: photo('photo-1607860108855-64acf2078ed9'),
        popular: true,
      },
      {
        name: 'Parts',
        slug: 'parts',
        description: 'Replacement parts and fluids.',
        image: photo('photo-1486262715619-67b85e0b08d3'),
      },
      {
        name: 'Accessories',
        slug: 'car-accessories',
        description: 'Mounts, organizers, and covers.',
        image: photo('photo-1449965408869-eaa3f722e40d'),
      },
    ],
  },
  {
    name: 'Books',
    slug: 'books',
    description: 'Fiction, nonfiction, and stationery.',
    image: photo('photo-1512820790803-83ca734da794'),
    children: [
      {
        name: 'Fiction',
        slug: 'fiction',
        description: 'Novels and short stories.',
        image: photo('photo-1544947950-fa07a98d237f'),
        popular: true,
      },
      {
        name: 'Nonfiction',
        slug: 'nonfiction',
        description: 'Biography, business, and how-to.',
        image: photo('photo-1457369804613-52c61a468e7d'),
      },
      {
        name: 'Kids',
        slug: 'kids-books',
        description: 'Picture books and early readers.',
        image: photo('photo-1512820790803-83ca734da794'),
      },
      {
        name: 'Stationery',
        slug: 'stationery',
        description: 'Notebooks and writing tools.',
        image: photo('photo-1455390582262-044cdead277a'),
      },
    ],
  },
];
