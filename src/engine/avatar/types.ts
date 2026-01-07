// src/engine/avatar/types.ts

export type SkinToneId = "s1" | "s2" | "s3" | "s4" | "s5" | "s6";
export type HairColorId = "hc1" | "hc2" | "hc3" | "hc4";

// These should match the keys in PARTS
export type HeadId = "head01";
export type EyesId = "eyes01" | "eyes02";
export type BrowsId = "brows01" | "brows02";
export type NoseId = "nose01";
export type MouthId = "mouth01" | "mouth02";
export type HairId = "hair01" | "hair02";
export type OutfitTopId = "top01" | "top02";
export type AccessoryId = "glasses01" | "none";

export type AvatarRecipe = {
  skinTone: SkinToneId;
  hairColor: HairColorId;
  head: HeadId;
  eyes: EyesId;
  brows: BrowsId;
  nose: NoseId;
  mouth: MouthId;
  hair: HairId;
  outfitTop: OutfitTopId;
  accessory: AccessoryId;
};

export const DEFAULT_AVATAR: AvatarRecipe = {
  skinTone: "s2",
  hairColor: "hc2",
  head: "head01",
  eyes: "eyes01",
  brows: "brows01",
  nose: "nose01",
  mouth: "mouth01",
  hair: "hair01",
  outfitTop: "top01",
  accessory: "none",
};
