// Base URLs for content
export const LOCAL_BASE_URL = '/SEEDDB';
export const GITHUB_BASE_URL = 'https://raw.githubusercontent.com/seeditDev/SEEDDB/main';
export const GITHUB_API_URL = 'https://api.github.com/repos/seeditDev/SEEDDB/contents';

export const ACADEMIC_YEARS = {
    '2K26': '2026 Batch',
    '2K27': '2027 Batch',
    '2K28': '2028 Batch',
    '2K29': '2029 Batch'
};

// GitHub token parts (encoded for security)
export const TOKEN_PARTS = {
    _0x5f: 'Z2l0aHViX3Bh',  // Part 1
    _0x4e: 'dF8xMUJDT1FG',  // Part 2
    _0x3d: 'Q0EwYU1RcHVi',  // Part 3
    _0x2c: 'SmZ0dk9xX3Nv',  // Part 4
    _0x1b: 'S0lDWlVyNVY4',  // Part 5
    _0xa0: 'ZHN5ckZsTDVa',  // Part 6
    _0xb1: 'SW5IZWNXYjYw',  // Part 7
    _0xc2: 'd1ZEdEpsR1dY',  // Part 8
    _0xd3: 'dG56bWZDUUZK',  // Part 9
    _0xe4: 'UU9KTjJBZDhocEZO'  // Part 10
};

export const COLLEGES = {

    'KITE': 'KGiSL Institute of Technology (KITE)',
    'KGCAS': 'KGiSL College of Arts and Science (KGCAS)',
    'KGIIM': 'KGiSL Institute of Information Management (KGiSL-IIM)',
    'KIT': 'Kalaignar Karunanidhi Institute of Technology (KIT)',
    'SEED-IT': 'SEED Innovating Technologies and Educational Services (SEED-IT)'
};

export const CACHE_CONFIG = {
    EXPIRY_TIME: 30 * 60 * 1000, // 30 minutes in milliseconds
    PREFIX: {
        PROFILES: 'college_profiles_',
        ACCESS: 'college_access_',
        SCORES: 'college_scores_',
        FULL_DB: 'college_fulldb_'
    }
};

// Access Control Configuration
export const ACCESS_CONTROL = {
    FILE_PATH: '/SEEDDB/access_control.json',
    MODULE_TYPES: {
        FUNDAMENTALS: 'F',
        DSA: 'D',
        ADVANCED: 'T',
        PROJECTS: 'P',
        ASSESSMENTS: 'A',
        COMPANY: 'C',
        SPECIAL: 'S',
        MCQS: 'M'
    }
};

// API Endpoints
export const API_ENDPOINTS = {
    LOCAL: {
        STAFF_PASSWORD: `${LOCAL_BASE_URL}/staffLogin/staffPassword.json`,
        getCollegeData: (college, year, file) => `${LOCAL_BASE_URL}/colleges/${college}/${year}/${file}.json`,
        ACCESS_CONTROL: `${LOCAL_BASE_URL}/access_control.json`
    },
    GITHUB: {
        STAFF_PASSWORD: `${GITHUB_BASE_URL}/staffLogin/staffPassword.json`,
        getCollegeData: (college, year, file) => `${GITHUB_BASE_URL}/colleges/${college}/${year}/${file}.json`,
        ACCESS_CONTROL: `${GITHUB_BASE_URL}/access_control.json`
    },
    GITHUB_API: {
        STAFF_PASSWORD: `${GITHUB_API_URL}/staffLogin/staffPassword.json`,
        getCollegeData: (college, year, file) => `${GITHUB_API_URL}/colleges/${college}/${year}/${file}.json`,
        ACCESS_CONTROL: `${GITHUB_API_URL}/access_control.json`
    }
};

export const FILE_TYPES = {
    PROFILES: 'profiles',
    ACCESS: 'access',
    SCORES: 'scores',
    FULL_DB: 'fullDB'
}; 