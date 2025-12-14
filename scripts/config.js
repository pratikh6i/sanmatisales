/**
 * Configuration for Sanmati Sales
 */
const CONFIG = {
    // GitHub Repository Settings - USING SAME REPO FOR MEDIA
    GITHUB_USERNAME: 'pratikh6i',
    GITHUB_REPO: 'sanmatisales',  // Production repo
    MEDIA_FOLDER: 'media',                  // Folder for product images/videos

    // Contact Information
    WHATSAPP_NUMBER: '918530515022',

    // API URLs
    get GITHUB_API_URL() {
        return `https://api.github.com/repos/${this.GITHUB_USERNAME}/${this.GITHUB_REPO}/contents/${this.MEDIA_FOLDER}`;
    },

    get GITHUB_RAW_URL() {
        return `https://raw.githubusercontent.com/${this.GITHUB_USERNAME}/${this.GITHUB_REPO}/main/${this.MEDIA_FOLDER}`;
    },

    // Logo location
    get LOGO_URL() {
        return `https://raw.githubusercontent.com/${this.GITHUB_USERNAME}/${this.GITHUB_REPO}/main/assets/logo.png`;
    },

    // WhatsApp logo location - upload your custom WhatsApp logo here
    get WHATSAPP_LOGO_URL() {
        return `https://raw.githubusercontent.com/${this.GITHUB_USERNAME}/${this.GITHUB_REPO}/main/assets/whatsapp.png`;
    },

    // Products metadata file
    PRODUCTS_JSON: 'products.json',

    // Local Storage Keys
    STORAGE_KEYS: {
        GITHUB_TOKEN: 'sanmati_github_token_v2',      // Encrypted token storage
        PRODUCTS_METADATA: 'sanmati_products_metadata',
        SESSION_VALID: 'sanmati_session_valid',       // Session persistence
    },

    // Image Extensions
    ALLOWED_EXTENSIONS: ['jpg', 'jpeg', 'png', 'gif', 'webp'],

    // Video Extensions
    VIDEO_EXTENSIONS: ['mp4', 'webm', 'mov'],

    // Max file size (10MB)
    MAX_FILE_SIZE: 10 * 1024 * 1024,

    // Map locations - Specific service areas
    MAP_LOCATIONS: [
        { name: 'Kolhapur', lat: 16.7050, lng: 74.2433 },
        { name: 'Ichalkaranji', lat: 16.6986, lng: 74.4597 },
        { name: 'Hatkanangle', lat: 16.7466, lng: 74.4345 },
        { name: 'Sangli', lat: 16.8524, lng: 74.5815 },
        { name: 'Kodoli', lat: 16.8753, lng: 74.2037 },
        { name: 'Warna', lat: 16.8200, lng: 74.1800 },
        { name: 'Vadgaon', lat: 16.7308, lng: 74.2895 },
        { name: 'Asta', lat: 16.9500, lng: 74.4500 },
        { name: 'Kothali', lat: 16.7600, lng: 74.3200 },
    ],
};

// Make read-only
Object.freeze(CONFIG);
Object.freeze(CONFIG.STORAGE_KEYS);
