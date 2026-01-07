export type AvatarRecipe = {
  skin: "s1" | "s2" | "s3" | "s4" | "s5" | "s6";
  hair: "h0" | "h1" | "h2";
  hairColor: "hc1" | "hc2" | "hc3" | "hc4";
  eyes: "e1" | "e2";
  brows: "b1" | "b2";
  mouth: "m1" | "m2";
  outfit: "o1" | "o2";
  shoes: "sh1" | "sh2";
  accessory: "a0" | "a1";
};

export const DEFAULT_AVATAR: AvatarRecipe = {
  skin: "s3",
  hair: "h1",
  hairColor: "hc2",
  eyes: "e1",
  brows: "b1",
  mouth: "m1",
  outfit: "o1",
  shoes: "sh1",
  accessory: "a0",
};

