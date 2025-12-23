import { julia } from './julia.js';
import { sierpinskiTriangle, sierpinskiCarpet, sierpinskiPyramid } from './sierpinski.js';
import { mengerSponge } from './menger.js';
import { plasma } from './plasma.js';
import { liquid } from './liquid.js';
import { dynamicMorph } from './morph.js';
import { starJourney, star3D } from './star.js';
import { web3D } from './web.js';
import { energyCore } from './energy.js';
import { kochCurve, peanoCurve, pythagorasTree, lSystemTree, fern } from './overlay.js';

export const fractals = [
  julia,
  sierpinskiTriangle,
  sierpinskiCarpet,
  mengerSponge,
  sierpinskiPyramid,
  kochCurve,
  peanoCurve,
  pythagorasTree,
  lSystemTree,
  fern,
  plasma,
  dynamicMorph,
  starJourney,
  liquid,
  web3D,
  star3D,
  energyCore
];

export const getFractalById = (id) => fractals.find(f => f.id === id);
