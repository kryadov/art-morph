export const sierpinskiTriangle = {
  id: 1,
  name: 'Sierpinski Triangle',
  type: 'shader',
  defaults: {
    maxIter: 9,
    scale: 1.2,
    rotationDeg: 0,
    center: { x: 0.0, y: 0.0 }
  },
  glsl: `
// Sierpinski Triangle test using base-2 fractional folding
// Returns t in [0,1], where lower values indicate earlier removal (more hollow)
float sierpinskiTri(vec2 pNorm) {
  vec2 q = pNorm;
  float tLevel = 1.0;
  for (int ii = 0; ii < 1024; ii++) {
    if (ii >= u_maxIter) break;
    vec2 r = fract(q * 2.0);
    // In a unit triangle tiling, points with r.x + r.y > 1 are in the 'removed' central region
    if (r.x + r.y > 1.0) {
      tLevel = float(ii) / max(1.0, float(u_maxIter));
      return tLevel; // early removal
    }
    q = r;
  }
  return 1.0; // never removed => deepest level
}
`
};

export const sierpinskiCarpet = {
  id: 2,
  name: 'Sierpinski Carpet',
  type: 'shader',
  defaults: {
    maxIter: 6,
    scale: 1.0,
    rotationDeg: 0,
    center: { x: 0.0, y: 0.0 }
  },
  glsl: `
// Sierpinski Carpet using base-3 digit test
float sierpinskiCarpet(vec2 pNorm) {
  vec2 q = pNorm;
  float tLevel = 1.0;
  for (int ii = 0; ii < 1024; ii++) {
    if (ii >= u_maxIter) break;
    vec2 r = fract(q * 3.0);
    if (r.x > 1.0/3.0 && r.x < 2.0/3.0 && r.y > 1.0/3.0 && r.y < 2.0/3.0) {
      tLevel = float(ii) / max(1.0, float(u_maxIter));
      return tLevel;
    }
    q = r;
  }
  return 1.0;
}
`
};

export const sierpinskiPyramid = {
  id: 4,
  name: 'Sierpinski Pyramid',
  type: 'shader',
  defaults: {
    maxIter: 9,
    scale: 1.0,
    rotationDeg: 0,
    center: { x: 0.0, y: 0.0 }
  },
  glsl: `
// Sierpinski Pyramid (tetrahedral gasket) approximate rule: removed when x+y+y >1 in tri, generalized to 3D as sum > 1
float sierpinskiPyramidDepth(vec3 p) {
  vec3 q = p;
  for (int ii = 0; ii < 128; ii++) {
    if (ii >= u_maxIter) break;
    vec3 r = fract(q * 2.0);
    if (r.x + r.y + r.z > 1.0) {
      return float(ii) / max(1.0, float(u_maxIter));
    }
    q = r;
  }
  return 1.0;
}
`
};
