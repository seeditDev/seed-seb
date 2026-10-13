import * as tf from '@tensorflow/tfjs';

export const calculateIoU = (box1, box2) => {
  const [x1_1, y1_1, x2_1, y2_1] = box1;
  const [x1_2, y1_2, x2_2, y2_2] = box2;
  
  const xMin = Math.max(x1_1, x1_2);
  const yMin = Math.max(y1_1, y1_2);
  const xMax = Math.min(x2_1, x2_2);
  const yMax = Math.min(y2_1, y2_2);
  
  const intersectionArea = Math.max(0, xMax - xMin) * Math.max(0, yMax - yMin);
  const area1 = (x2_1 - x1_1) * (y2_1 - y1_1);
  const area2 = (x2_2 - x1_2) * (y2_2 - y1_2);
  const unionArea = area1 + area2 - intersectionArea;
  
  if (unionArea === 0) return 0;
  return intersectionArea / unionArea;
};

export const cpuNMS = (candidates, iouThreshold = 0.5) => {
  candidates.sort((a, b) => b.score - a.score);
  
  const selected = [];
  for (const candidate of candidates) {
    let keep = true;
    for (const active of selected) {
      if (candidate.classId === active.classId) {
        const iou = calculateIoU(candidate.box, active.box);
        if (iou > iouThreshold) {
          keep = false;
          break;
        }
      }
    }
    if (keep) {
      selected.push(candidate);
    }
  }
  return selected;
};

/**
 * Executes YOLOv8 model inference on an HTMLVideoElement or HTMLCanvasElement
 * Detects person (0), laptop/monitor/keyboard (63, 62, 66), and prohibited items (cell phone 67, book 73, bag 24/26/28)
 */
export const runYolov8Inference = async (videoElement, model) => {
  let result = { 
    personCount: 0, 
    laptopDetected: false, 
    phoneDetected: false, 
    bookDetected: false, 
    bagDetected: false,
    prohibitedDetected: false,
    prohibitedItems: []
  };

  if (!videoElement || !model) return result;
  if (videoElement instanceof HTMLVideoElement && (videoElement.readyState < 2 || videoElement.videoWidth === 0)) {
    return result;
  }
  
  const isTensor = (obj) => {
    return obj && typeof obj.reshape === 'function' && typeof obj.dispose === 'function';
  };

  try {
    const tensors = tf.tidy(() => {
      const img = tf.browser.fromPixels(videoElement);
      const resized = tf.image.resizeBilinear(img, [640, 640]);
      const normalized = resized.div(255.0);
      const input = normalized.expandDims(0); // [1, 640, 640, 3]
      
      let output;
      if (typeof model.execute === 'function') {
        output = model.execute(input);
      } else if (typeof model.predict === 'function') {
        output = model.predict(input);
      } else {
        throw new Error("Model has no execute or predict methods");
      }
      
      let outputTensor = output;
      if (Array.isArray(output)) {
        outputTensor = output[0];
      } else if (output && !isTensor(output)) {
        const keys = Object.keys(output);
        if (keys.length > 0) {
          outputTensor = output[keys[0]];
        }
      }
      
      if (!outputTensor || !isTensor(outputTensor)) {
        throw new Error("Failed to retrieve a valid tensor output from YOLOv8 model");
      }
      
      const shape = outputTensor.shape;
      let transposed;
      
      if (shape.length === 3) {
        const [, d1, d2] = shape;
        if (d1 === 84 && d2 === 8400) {
          transposed = outputTensor.reshape([84, 8400]).transpose([1, 0]);
        } else if (d1 === 8400 && d2 === 84) {
          transposed = outputTensor.reshape([8400, 84]);
        } else {
          transposed = outputTensor.reshape([d1, d2]);
          if (d1 < d2) {
            transposed = transposed.transpose([1, 0]);
          }
        }
      } else if (shape.length === 2) {
        const [d1, d2] = shape;
        transposed = outputTensor;
        if (d1 === 84 && d2 === 8400) {
          transposed = transposed.transpose([1, 0]);
        }
      } else {
        throw new Error(`Unexpected output tensor shape: ${shape}`);
      }
      
      const boxes = transposed.slice([0, 0], [-1, 4]); // [8400, 4]
      const scores = transposed.slice([0, 4], [-1, 80]); // [8400, 80]
      const maxScores = scores.max(1); // [8400]
      const classIds = scores.argMax(1); // [8400]
      const mask = maxScores.greater(0.35); // [8400]
      
      return { boxes, maxScores, classIds, mask };
    });

    try {
      const [filteredBoxes, filteredScores, filteredClasses] = await Promise.all([
        tf.booleanMaskAsync(tensors.boxes, tensors.mask),
        tf.booleanMaskAsync(tensors.maxScores, tensors.mask),
        tf.booleanMaskAsync(tensors.classIds, tensors.mask)
      ]);
      
      const boxesArray = await filteredBoxes.array();
      const scoresArray = await filteredScores.array();
      const classesArray = await filteredClasses.array();
      
      const candidates = [];
      // COCO target classes:
      // 0: person, 24: backpack, 26: handbag, 28: suitcase, 62: tv/monitor, 63: laptop, 66: keyboard, 67: cell phone, 73: book
      const TARGET_CLASSES = new Set([0, 24, 26, 28, 62, 63, 66, 67, 73]);

      for (let i = 0; i < classesArray.length; i++) {
        const classId = classesArray[i];
        if (TARGET_CLASSES.has(classId)) {
          const [x_center, y_center, w, h] = boxesArray[i];
          const x1 = x_center - w / 2;
          const y1 = y_center - h / 2;
          const x2 = x_center + w / 2;
          const y2 = y_center + h / 2;
          
          candidates.push({
            box: [x1, y1, x2, y2],
            score: scoresArray[i],
            classId
          });
        }
      }
      
      const suppressed = cpuNMS(candidates, 0.45);
      
      let personCount = 0;
      let laptopDetected = false;
      let phoneDetected = false;
      let bookDetected = false;
      let bagDetected = false;
      
      for (const item of suppressed) {
        if (item.classId === 0 && item.score >= 0.35) {
          personCount++;
        } else if ((item.classId === 63 || item.classId === 62 || item.classId === 66) && item.score >= 0.32) {
          laptopDetected = true; // Laptop, monitor/screen, or keyboard detected
        } else if (item.classId === 67 && item.score >= 0.40) {
          phoneDetected = true;
        } else if (item.classId === 73 && item.score >= 0.40) {
          bookDetected = true;
        } else if ((item.classId === 24 || item.classId === 26 || item.classId === 28) && item.score >= 0.38) {
          bagDetected = true;
        }
      }
      
      result = { 
        personCount, 
        laptopDetected, 
        phoneDetected, 
        bookDetected, 
        bagDetected,
        prohibitedDetected: phoneDetected || bookDetected || bagDetected,
        prohibitedItems: [
          ...(phoneDetected ? ['cell phone'] : []),
          ...(bookDetected ? ['book/notes'] : []),
          ...(bagDetected ? ['bag/backpack'] : [])
        ]
      };
      
      filteredBoxes.dispose();
      filteredScores.dispose();
      filteredClasses.dispose();
    } catch (postErr) {
      console.warn('[YOLOv8] Post-processing error:', postErr);
    } finally {
      tensors.boxes.dispose();
      tensors.maxScores.dispose();
      tensors.classIds.dispose();
      tensors.mask.dispose();
    }
  } catch (infErr) {
    console.warn('[YOLOv8] Inference error:', infErr);
  }

  return result;
};

if (typeof window !== 'undefined') {
  window.runYolov8Inference = runYolov8Inference;
}
