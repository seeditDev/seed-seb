/**
 * Netlify Serverless Function: verify-binary
 * 
 * Called by SEED-SEB.exe on startup to verify its own integrity.
 * Queries Supabase for the registered official hash of the current version.
 * 
 * URL: GET /.netlify/functions/verify-binary?hash=<sha256>&version=<ver>
 * OR via redirect:  GET /api/verify-binary?hash=<sha256>&version=<ver>
 * 
 * Response:
 *   { "valid": true  }  → hash matches official build, allow startup
 *   { "valid": false, "message": "..." } → tampered binary, block startup
 */

const { createClient } = require('@supabase/supabase-js');

// Supabase connection (same project already used by the frontend)
const SUPABASE_URL = 'https://iygqntndsgiysvibqjyw.supabase.co';
// Use service role key (set as Netlify env variable - NOT the anon key)
// In Netlify Dashboard → Site Settings → Environment Variables:
//   Key: SUPABASE_SERVICE_KEY
//   Value: <your supabase service_role key>
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event) => {
    // CORS headers so the desktop app can call this
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
    };

    // Only allow GET requests
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const { hash, version } = event.queryStringParameters || {};

    if (!hash || !version) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ valid: false, message: 'Missing hash or version parameter.' }),
        };
    }

    // Sanitize: SHA-256 is exactly 64 hex characters
    if (!/^[a-f0-9]{64}$/i.test(hash)) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ valid: false, message: 'Invalid hash format.' }),
        };
    }

    // If Supabase key is not configured yet, fail open (allow startup)
    // Remove this block once you have set SUPABASE_SERVICE_KEY in Netlify
    if (!SUPABASE_KEY) {
        console.warn('[verify-binary] SUPABASE_SERVICE_KEY not set — failing open.');
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ valid: true, message: 'Integrity check not yet configured (fail-open).' }),
        };
    }

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

        // Query the app_build_hashes table for this version + hash combination
        const { data, error } = await supabase
            .from('app_build_hashes')
            .select('id, version, sha256_hash, is_active')
            .eq('version', version)
            .eq('sha256_hash', hash.toLowerCase())
            .eq('is_active', true)
            .limit(1);

        if (error) {
            console.error('[verify-binary] Supabase error:', error.message);
            // DB error → fail open (don't block legitimate users due to our own infra issues)
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ valid: true, message: 'Verification service temporarily unavailable.' }),
            };
        }

        if (data && data.length > 0) {
            // Hash matched a registered official build
            console.log(`[verify-binary] ✅ Valid hash for version ${version}`);
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ valid: true }),
            };
        } else {
            // Hash not found — either tampered or an unregistered build
            console.warn(`[verify-binary] ❌ REJECTED hash for version ${version}: ${hash.substring(0, 16)}...`);
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    valid: false,
                    message: 'This executable has been modified or is not an official SEED-IT release. Please reinstall from the official portal.',
                }),
            };
        }
    } catch (err) {
        console.error('[verify-binary] Unexpected error:', err.message);
        // Unexpected error → fail open
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ valid: true, message: 'Verification service error — fail-open.' }),
        };
    }
};
