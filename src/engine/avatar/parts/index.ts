// src/engine/avatar/parts/index.ts

import { head01 } from "../heads/head01";

import { eyes01 } from "../face/eyes01";
import { eyes02 } from "../face/eyes02";
import { brows01 } from "../face/brows01";
import { brows02 } from "../face/brows02";
import { nose01 } from "../face/nose01";
import { mouth01 } from "../face/mouth01";
import { mouth02 } from "../face/mouth02";

import { hair01_back } from "../hair/hair01_back";
import { hair01_front } from "../hair/hair01_front";
import { hair02_back } from "../hair/hair02_back";
import { hair02_front } from "../hair/hair02_front";

import { top01 } from "../outfits/top01";
import { top02 } from "../outfits/top02";

import { glasses01 } from "../accessories/glasses01";

export const VIEWBOX_BUST = "0 0 512 512";

export const PARTS = {
  heads: { head01 },
  face: {
    eyes01,
    eyes02,
    brows01,
    brows02,
    nose01,
    mouth01,
    mouth02,
  },
  hair: {
    hair01: { back: hair01_back, front: hair01_front },
    hair02: { back: hair02_back, front: hair02_front },
  },
  outfits: { top01, top02 },
  accessories: { glasses01 },
} as const;
