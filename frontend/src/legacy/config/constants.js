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

export const COLLEGES = {

    'SEEDIT': 'SEED Innovating Technologies and Educational Services (SEED-IT)',
    'KITE': 'KGiSL Institute of Technology (KITE)'

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