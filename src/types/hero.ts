export type HeroSlideDto = {
  eyebrow: string;
  title: string;
  description: string;
  image: string;
  isActive: boolean;
};

export type HeroDto = {
  slides: HeroSlideDto[];
};
