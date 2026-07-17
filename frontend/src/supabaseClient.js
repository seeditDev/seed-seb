import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://iygqntndsgiysvibqjyw.supabase.co';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'sb_publishable_t3I55wzxcJI5owngYx0A4w_oCLVZvq7';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Perform a Supabase upsert operation that is resilient to column schema changes.
 * If the upsert fails due to a missing column in the remote table (e.g. database schema cache out-of-sync),
 * it dynamically filters out the offending column from the payload and retries.
 */
export async function safeUpsert(tableName, payload, options = {}) {
  let attemptPayload = Array.isArray(payload) 
    ? payload.map(item => ({ ...item }))
    : { ...payload };

  while (true) {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .upsert(attemptPayload, options);

      if (!error) {
        return { data, error: null };
      }

      // Detect schema/column mismatches
      // Code PGRST204: Could not find the 'col' column in the schema cache
      // Code 42703: column "col" of relation "table" does not exist
      const isMissingColumnError = 
        error.code === 'PGRST204' || 
        error.code === '42703' || 
        (error.message && error.message.toLowerCase().includes('column') && 
          (error.message.toLowerCase().includes('schema cache') || 
           error.message.toLowerCase().includes('does not exist') ||
           error.message.toLowerCase().includes('could not find')));

      if (isMissingColumnError) {
        // Try parsing the missing column name from the error message
        let colName = null;

        // Pattern 1: Could not find the 'column_name' column
        const matchPgrst = error.message.match(/Could not find the '([^']+)' column/i);
        if (matchPgrst && matchPgrst[1]) {
          colName = matchPgrst[1];
        } else {
          // Pattern 2: column "column_name" of relation "..." does not exist
          const matchPg = error.message.match(/column "([^"]+)"/i);
          if (matchPg && matchPg[1]) {
            colName = matchPg[1];
          }
        }

        if (colName) {
          if (Array.isArray(attemptPayload)) {
            let found = false;
            attemptPayload.forEach(item => {
              if (colName in item) {
                delete item[colName];
                found = true;
              }
            });
            if (found) {
              console.warn(`[Supabase safeUpsert] Array item column '${colName}' not found in remote '${tableName}' table. Retrying without it.`);
              continue;
            }
          } else if (colName in attemptPayload) {
            console.warn(`[Supabase safeUpsert] Column '${colName}' not found in remote '${tableName}' table. Retrying without it.`);
            delete attemptPayload[colName];
            continue;
          }
        }
      }

      // Detect check constraint violation for type on assessment_results
      const isCheckConstraintViolation = 
        error.code === '23514' && 
        error.message && 
        error.message.toLowerCase().includes('assessment_results_type_check');

      if (isCheckConstraintViolation) {
        if (Array.isArray(attemptPayload)) {
          let found = false;
          attemptPayload.forEach(item => {
            if (item.type === 'multisection') {
              item.type = 'mcq';
              found = true;
            }
          });
          if (found) {
            console.warn(`[Supabase safeUpsert] Array items: 'multisection' type violates CHECK constraint. Falling back to 'mcq' type and retrying.`);
            continue;
          }
        } else if (attemptPayload && attemptPayload.type === 'multisection') {
          console.warn(`[Supabase safeUpsert] 'multisection' type violates CHECK constraint. Falling back to 'mcq' type and retrying.`);
          attemptPayload.type = 'mcq';
          continue;
        }
      }

      // If we couldn't parse the missing column, or it was a different error, return the error
      return { data, error };
    } catch (e) {
      return { data: null, error: { message: e.message || String(e) } };
    }
  }
}
