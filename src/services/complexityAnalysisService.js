/**
 * complexityAnalysisService.js
 * High-performance algorithmic time & space complexity analyzer for SEED-SEB.
 * Evaluates code structure, loop nesting, and data allocations against problem optimal benchmarks.
 */

export const complexityAnalysisService = {
  /**
   * Statically inspects user code to estimate Big-O Time & Space Complexity
   */
  analyze(code = '', language = 'python', questionData = null) {
    if (!code || typeof code !== 'string' || !code.trim()) {
      return null;
    }

    // 1. Remove comments and string literals to prevent false matches
    const noComments = code
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/#.*$/gm, '')
      .replace(/("""|''')[\s\S]*?\1/g, '')
      .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');

    // 2. Detect Loop Depth
    const lines = noComments.split('\n');
    const loopRegex = /\b(for|while)\b/;
    const innerSearchRegex = /\b(\.includes|\.indexOf|\.find|\.filter|\.contains|\.count)\b|(?:\bin\b\s+[^:\n]+:)/;

    let maxNesting = 0;
    let currentNesting = 0;
    let hasHiddenNestedLoop = false;
    let hasSorting = false;
    let hasDivideAndConquer = false;
    let hasHashMapOrSet = false;
    let hasDynamicArray = false;

    // Check for sorting
    if (/\b(sort|sorted|Arrays\.sort|Collections\.sort|std::sort|\.sort\b)/.test(noComments)) {
      hasSorting = true;
    }

    // Check for divide-and-conquer / binary search
    if (/(>>\s*1|\/\/\s*2|\/\s*2\.0|\bmid\b|\bbinary_search\b|\bbisect\b)/i.test(noComments) && loopRegex.test(noComments)) {
      hasDivideAndConquer = true;
    }

    // Check for auxiliary memory allocations
    if (/\b(new\s+Map|new\s+Set|\bdict\b|\bset\(\)|\bunordered_map\b|\bunordered_set\b|HashMap|HashSet|\{\s*\})/i.test(noComments)) {
      hasHashMapOrSet = true;
    }
    if (/\b(new\s+Array|\[\s*\]|\blist\(\)|\bvector<|ArrayList)/i.test(noComments)) {
      hasDynamicArray = true;
    }

    // Track loop nesting
    let insideLoop = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (loopRegex.test(trimmed)) {
        currentNesting++;
        insideLoop = true;
        if (currentNesting > maxNesting) maxNesting = currentNesting;
      }

      if (insideLoop && innerSearchRegex.test(trimmed)) {
        hasHiddenNestedLoop = true;
      }

      if (trimmed.includes('}') && currentNesting > 0) {
        currentNesting--;
        if (currentNesting === 0) insideLoop = false;
      }
    }

    // Determine estimated Time Complexity
    let detectedTime = 'O(1)';
    let shape = 'constant';

    if (maxNesting >= 3) {
      detectedTime = 'O(n³)';
      shape = 'cubic';
    } else if (maxNesting >= 2 || (maxNesting >= 1 && hasHiddenNestedLoop)) {
      detectedTime = 'O(n²)';
      shape = 'quadratic';
    } else if (hasSorting) {
      detectedTime = maxNesting >= 1 ? 'O(n² log n)' : 'O(n log n)';
      shape = 'linearithmic';
    } else if (hasDivideAndConquer && maxNesting <= 1) {
      detectedTime = maxNesting === 1 ? 'O(log n)' : 'O(1)';
      shape = 'log';
    } else if (maxNesting === 1) {
      detectedTime = 'O(n)';
      shape = 'linear';
    }

    // Determine estimated Space Complexity
    let detectedSpace = 'O(1)';
    if (hasHashMapOrSet || hasDynamicArray) {
      detectedSpace = 'O(n)';
    }

    // 3. Compare with benchmark data from question
    const optimal = questionData?.complexityAnalysis?.optimal || questionData?.optimal || null;
    const bruteForce = questionData?.complexityAnalysis?.bruteForce || questionData?.bruteForce || null;

    let verdict = 'COMPLETED';
    let isOptimal = true;
    let guidance = 'Your algorithm ran within expected complexity bounds.';

    if (optimal?.time) {
      const normOptimal = optimal.time.replace(/\s+/g, '').toLowerCase();
      const normDetected = detectedTime.replace(/\s+/g, '').toLowerCase();

      if (normDetected === normOptimal) {
        verdict = 'OPTIMAL';
        isOptimal = true;
        guidance = 'Outstanding! Your solution achieves the optimal time complexity of ' + optimal.time + ' using an optimal pattern (' + (optimal.pattern || 'ideal algorithm') + ').';
      } else if (shape === 'quadratic' && (normOptimal.includes('o(n)') || normOptimal.includes('o(nlogn)'))) {
        verdict = 'SUB_OPTIMAL';
        isOptimal = false;
        guidance = 'Your solution has a quadratic ' + detectedTime + ' runtime (nested traversal). The optimal benchmark is ' + optimal.time + ' using ' + (optimal.pattern || 'a hash map or two-pointer approach') + '.';
      } else {
        verdict = 'ACCEPTABLE';
        guidance = 'Detected ' + detectedTime + ' runtime. The target optimal benchmark is ' + optimal.time + '.';
      }
    }

    return {
      time: detectedTime,
      space: detectedSpace,
      shape,
      optimalTime: optimal?.time || 'O(n)',
      optimalSpace: optimal?.space || 'O(1)',
      optimalPattern: optimal?.pattern || '',
      bruteForceTime: bruteForce?.time || 'O(n²)',
      bruteForceApproach: bruteForce?.approach || '',
      verdict,
      isOptimal,
      guidance,
      hints: questionData?.hints || []
    };
  }
};

export default complexityAnalysisService;
