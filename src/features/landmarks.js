// Barrel re-export for the Famous Landmarks system, registry, and 3D model table.
export { LandmarkSystem } from "./landmarks/landmark_system.js";
export {
  LANDMARKS,
  getLandmark,
  landmarkWorldXZ,
  inLandmarkFootprint,
  landmarkDeckY,
  makeLandmarkDeckTest,
  makeLandmarkSuppressor,
} from "./landmarks/registry.js";
export { MODELS } from "./landmarks/models/index.js";
