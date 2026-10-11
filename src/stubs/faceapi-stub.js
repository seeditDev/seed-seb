const dummyPromise = () => Promise.resolve({});
export const nets = {
  tinyFaceDetector: { loadFromUri: dummyPromise },
  faceLandmark68Net: { loadFromUri: dummyPromise },
  faceRecognitionNet: { loadFromUri: dummyPromise },
  faceExpressionNet: { loadFromUri: dummyPromise },
  ssdMobilenetv1: { loadFromUri: dummyPromise },
};
export const matchDimensions = () => {};
export const resizeResults = () => ({});
export const detectSingleFace = () => ({
  withFaceLandmarks: () => ({
    withFaceDescriptor: () => Promise.resolve(null),
    withFaceExpressions: () => Promise.resolve(null),
  }),
});
export const detectAllFaces = () => ({
  withFaceLandmarks: () => ({
    withFaceExpressions: () => Promise.resolve([]),
    withFaceDescriptors: () => Promise.resolve([]),
  }),
});
export class TinyFaceDetectorOptions {}
export class SsdMobilenetv1Options {}
export const euclideanDistance = () => 0;

const faceapi = {
  nets,
  matchDimensions,
  resizeResults,
  detectSingleFace,
  detectAllFaces,
  TinyFaceDetectorOptions,
  SsdMobilenetv1Options,
  euclideanDistance,
};
export default faceapi;
