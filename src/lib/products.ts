export type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  emoji: string;
  blurb: string;
};

export const PRODUCTS: Product[] = [
  {
    id: "flalmstig-sofa",
    name: "FLÄMSTIG",
    category: "Sofas",
    price: 499,
    emoji: "🛋️",
    blurb: "A three-seat sofa with deep cushions and a washable cover.",
  },
  {
    id: "bjorko-table",
    name: "BJÖRKÖ",
    category: "Tables",
    price: 199,
    emoji: "🪑",
    blurb: "Solid birch dining table that seats four comfortably.",
  },
  {
    id: "snoflinga-lamp",
    name: "SNÖFLINGA",
    category: "Lighting",
    price: 39,
    emoji: "💡",
    blurb: "A warm LED floor lamp with a linen shade.",
  },
  {
    id: "krokig-shelf",
    name: "KROKIG",
    category: "Storage",
    price: 129,
    emoji: "🗄️",
    blurb: "Modular bookshelf that grows with your collection.",
  },
  {
    id: "vaggis-bed",
    name: "VÄGGIS",
    category: "Beds",
    price: 349,
    emoji: "🛏️",
    blurb: "A queen bed frame with an upholstered headboard.",
  },
  {
    id: "mysig-rug",
    name: "MYSIG",
    category: "Textiles",
    price: 59,
    emoji: "🧶",
    blurb: "A hand-woven wool rug that feels great underfoot.",
  },
];

export function getProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}
