/**
 * Proctoring Cache Manager
 * Handles local storage caching, auto-expiration, and cleanup of proctoring-related session data.
 */

const CACHE_KEYS = {
  PHOTO: 'proctor_reference_photo',
  DESCRIPTOR: 'proctor_reference_descriptor',
  EXPIRY: 'proctor_cache_expiry',
  ACTIVE_TEST: 'proctor_active_test_id'
};

/**
 * Sets the expiration timestamp for the proctoring session based on assessment duration
 * @param {number} durationMinutes - Assessment duration in minutes
 * @param {string} testID - The unique ID of the active assessment
 */
export const setProctorCacheExpiry = (durationMinutes, testID) => {
  if (!durationMinutes || isNaN(durationMinutes)) durationMinutes = 60;
  
  // Expiry time is the duration of the test + a 15-minute grace period to prevent premature clearing
  const expiryTime = Date.now() + (durationMinutes + 15) * 60 * 1000;
  
  console.log(`[ProctorCache] Setting session expiry to: ${new Date(expiryTime).toLocaleTimeString()} for test: ${testID}`);
  localStorage.setItem(CACHE_KEYS.EXPIRY, expiryTime.toString());
  if (testID) {
    localStorage.setItem(CACHE_KEYS.ACTIVE_TEST, testID.toString());
  }
};

/**
 * Wipes all proctoring session data from local storage
 */
export const clearAllProctorCache = () => {
  console.log('[ProctorCache] Explicitly wiping all proctoring localStorage items...');
  localStorage.removeItem(CACHE_KEYS.PHOTO);
  localStorage.removeItem(CACHE_KEYS.DESCRIPTOR);
  localStorage.removeItem(CACHE_KEYS.EXPIRY);
  localStorage.removeItem(CACHE_KEYS.ACTIVE_TEST);
  
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (
      key.startsWith('proctor_violations_') || 
      key.startsWith('proctor_events_')
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
export const checkAndClearProctorCache = () => {
  const expiry = localStorage.getItem(CACHE_KEYS.EXPIRY);
  if (!expiry) return;

  const expiryTime = parseInt(expiry, 10);
  if (isNaN(expiryTime) || Date.now() > expiryTime) {
    console.log('[ProctorCache] Proctoring cache has expired. Performing automatic cleanup...');
    clearAllProctorCache();
  }
};
