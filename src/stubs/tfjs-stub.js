const dummyFn = () => Promise.resolve({});
export const tidy = (fn) => (typeof fn === 'function' ? fn() : {});
export const browser = { fromPixels: dummyFn };
export const image = { resizeBilinear: dummyFn };
export const booleanMaskAsync = dummyFn;
export const ready = () => Promise.resolve();
export const loadGraphModel = dummyFn;
export const loadLayersModel = dummyFn;
export const version = '0.0.0';

const tf = {
  tidy,
  browser,
  image,
  booleanMaskAsync,
  ready,
  loadGraphModel,
  loadLayersModel,
  version,
};
export default tf;
