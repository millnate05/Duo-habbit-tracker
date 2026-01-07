export type SkinTone = "s1" | "s2" | "s3" | "s4" | "s5" | "s6";
export type HairColor = "hc1" | "hc2" | "hc3" | "hc4";

export type OutfitColor = "o1" | "o2";

export type AvatarRecipe = {
  style: "bust_v1";

  skin: SkinTone;

  head: "head01";

  eyes: "eyes01" | "eyes02";
  brows: "brows01" | "brows02";
  nose: "nose01";
  mouth: "mouth01" | "mouth02";

  hair: "hair01" | "hair02";
  hairColor: HairColor;

  outfitTop: "top01" | "top02";
  outfitColor: OutfitColor;

  accessory: "none" | "glasses01";
};
