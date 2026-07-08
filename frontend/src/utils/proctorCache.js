/**
 * Proctoring Cache Manager
 * Handles local storage caching, auto-expiration, and cleanup of proctoring-related session data.
 */

export const getProctorCacheKeys = (testID) => {
  const suffix = testID ? `_${testID}` : '';
  return {
    PHOTO: `proctor_reference_photo${suffix}`,
    DESCRIPTOR: `proctor_reference_descriptor${suffix}`,
    EXPIRY: `proctor_cache_expiry${suffix}`,
    ACTIVE_TEST: `proctor_active_test_id${suffix}`
  };
};

/**
 * Sets the expiration timestamp for the proctoring session based on assessment duration
 * @param {number} durationMinutes - Assessment duration in minutes
 * @param {string} testID - The unique ID of the active assessment
 */
export const setProctorCacheExpiry = (durationMinutes, testID) => {
  if (!durationMinutes || isNaN(durationMinutes)) durationMinutes = 60;
  
  const expiryTime = Date.now() + (durationMinutes + 15) * 60 * 1000;
  console.log(`[ProctorCache] Setting session expiry to: ${new Date(expiryTime).toLocaleTimeString()} for test: ${testID}`);
  
  const keys = getProctorCacheKeys(testID);
  localStorage.setItem(keys.EXPIRY, expiryTime.toString());
  if (testID) {
    localStorage.setItem(keys.ACTIVE_TEST, testID.toString());
  }
};

/**
 * Wipes all proctoring session data from local storage
 * @param {string} [testID] - Optional test ID to wipe. If omitted, wipes all proctoring cache.
 */
export const clearAllProctorCache = (testID) => {
  console.log(`[ProctorCache] Wiping proctoring localStorage items for testID: ${testID || 'all'}`);
  
  if (!testID) {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.startsWith('proctor_reference_') || 
        key.startsWith('proctor_cache_') || 
        key.startsWith('proctor_active_') || 
        key.startsWith('proctor_violations_') || 
        key.startsWith('proctor_events_')
      )) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    return;
  }

  const keys = getProctorCacheKeys(testID);
  localStorage.removeItem(keys.PHOTO);
  localStorage.removeItem(keys.DESCRIPTOR);
  localStorage.removeItem(keys.EXPIRY);
  localStorage.removeItem(keys.ACTIVE_TEST);
  
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (
      key.startsWith('proctor_violations_') || 
      key.startsWith('proctor_events_') ||
      key.includes(`_${testID}`)
    )) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
};

/**
 * Checks if the cached proctoring session has expired.
 * If expired, it automatically wipes all proctoring local storage entries.
 */
export const checkAndClearProctorCache = (testID) => {
  const keys = getProctorCacheKeys(testID);
  const expiry = localStorage.getItem(keys.EXPIRY);
  if (!expiry) return;

  const expiryTime = parseInt(expiry, 10);
  if (isNaN(expiryTime) || Date.now() > expiryTime) {
    console.log('[ProctorCache] Proctoring cache has expired. Performing automatic cleanup...');
    clearAllProctorCache(testID);
  }
};
