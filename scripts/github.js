/**
 * GitHub API Utilities
 * Handles all interactions with GitHub API for image storage
 */
const GitHubAPI = {
    token: null,

    /**
     * Initialize with stored token (if any)
     */
    init() {
        const storedToken = localStorage.getItem(CONFIG.STORAGE_KEYS.GITHUB_TOKEN);
        const sessionValid = localStorage.getItem(CONFIG.STORAGE_KEYS.SESSION_VALID);

        if (storedToken && sessionValid) {
            this.token = storedToken;
        }
    },

    /**
     * Set and store the GitHub token with session
     */
    setToken(token) {
        this.token = token;
        localStorage.setItem(CONFIG.STORAGE_KEYS.GITHUB_TOKEN, token);
        localStorage.setItem(CONFIG.STORAGE_KEYS.SESSION_VALID, 'true');
    },

    /**
     * Clear the stored token
     */
    clearToken() {
        this.token = null;
        localStorage.removeItem(CONFIG.STORAGE_KEYS.GITHUB_TOKEN);
        localStorage.removeItem(CONFIG.STORAGE_KEYS.SESSION_VALID);
    },

    /**
     * Check if authenticated
     */
    isAuthenticated() {
        return !!this.token;
    },

    /**
     * Make authenticated API request
     */
    async request(url, options = {}) {
        const headers = {
            'Accept': 'application/vnd.github.v3+json',
            ...options.headers,
        };

        if (this.token) {
            headers['Authorization'] = `token ${this.token}`;
        }

        const response = await fetch(url, { ...options, headers });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            console.error('GitHub API Error Details:', {
                status: response.status,
                statusText: response.statusText,
                url: url,
                errorBody: error
            });
            throw new Error(error.message || `GitHub API Error: ${response.status}`);
        }

        return response.json();
    },

    /**
     * Fetch all products (images/videos) from the repository
     */
    async fetchProducts() {
        try {
            const files = await this.request(CONFIG.GITHUB_API_URL);

            // Filter for media files only
            const allExtensions = [...CONFIG.ALLOWED_EXTENSIONS, ...CONFIG.VIDEO_EXTENSIONS];
            const mediaFiles = files.filter(file => {
                if (file.type !== 'file') return false;
                const ext = file.name.split('.').pop().toLowerCase();
                return allExtensions.includes(ext);
            });

            return mediaFiles.map(file => ({
                name: file.name,
                path: file.path,
                sha: file.sha,
                size: file.size,
                downloadUrl: file.download_url,
                rawUrl: `${CONFIG.GITHUB_RAW_URL}/${file.name}`,
            }));
        } catch (error) {
            // If media folder doesn't exist yet, return empty array
            if (error.message.includes('404') || error.message.includes('Not Found')) {
                console.warn('Media folder not found, returning empty products list');
                return [];
            }
            console.error('Failed to fetch products:', error);
            throw error;
        }
    },

    /**
     * Fetch products metadata (display names)
     */
    async fetchMetadata() {
        try {
            const url = `${CONFIG.GITHUB_API_URL}/${CONFIG.PRODUCTS_JSON}`;
            const file = await this.request(url);
            const content = atob(file.content);
            return JSON.parse(content);
        } catch (error) {
            console.warn('Products metadata not found, using defaults');
            return {};
        }
    },

    /**
     * Save products metadata
     */
    async saveMetadata(metadata) {
        if (!this.isAuthenticated()) {
            throw new Error('Not authenticated');
        }

        const content = btoa(unescape(encodeURIComponent(JSON.stringify(metadata, null, 2))));
        const url = `${CONFIG.GITHUB_API_URL}/${CONFIG.PRODUCTS_JSON}`;

        let sha = null;
        try {
            const existing = await this.request(url);
            sha = existing.sha;
        } catch (e) {
            // File doesn't exist yet
        }

        const body = {
            message: 'Update product names',
            content: content,
        };

        if (sha) {
            body.sha = sha;
        }

        return this.request(url, {
            method: 'PUT',
            body: JSON.stringify(body),
        });
    },

    /**
     * Create media folder if it doesn't exist
     */
    async ensureMediaFolder() {
        try {
            await this.request(CONFIG.GITHUB_API_URL);
        } catch (error) {
            if (error.message.includes('404') || error.message.includes('Not Found')) {
                // Create a placeholder file to create the folder
                const url = `${CONFIG.GITHUB_API_URL}/.gitkeep`;
                await this.request(url, {
                    method: 'PUT',
                    body: JSON.stringify({
                        message: 'Create media folder',
                        content: btoa('# Media folder for product images'),
                    }),
                });
            }
        }
    },

    /**
     * Upload a new image
     */
    async uploadImage(file, customName = null) {
        if (!this.isAuthenticated()) {
            throw new Error('Not authenticated');
        }

        if (file.size > CONFIG.MAX_FILE_SIZE) {
            throw new Error('File too large. Maximum size is 10MB.');
        }

        const ext = file.name.split('.').pop().toLowerCase();
        const allExtensions = [...CONFIG.ALLOWED_EXTENSIONS, ...CONFIG.VIDEO_EXTENSIONS];
        if (!allExtensions.includes(ext)) {
            throw new Error('Invalid file type.');
        }

        // Ensure media folder exists
        await this.ensureMediaFolder();

        const timestamp = Date.now();
        const filename = customName
            ? `${customName.replace(/[^a-z0-9]/gi, '_')}_${timestamp}.${ext}`
            : `product_${timestamp}.${ext}`;

        const base64 = await this.fileToBase64(file);
        const url = `${CONFIG.GITHUB_API_URL}/${filename}`;

        return this.request(url, {
            method: 'PUT',
            body: JSON.stringify({
                message: `Add product: ${filename}`,
                content: base64,
            }),
        });
    },

    /**
     * Delete an image
     */
    async deleteImage(filename, sha) {
        if (!this.isAuthenticated()) {
            throw new Error('Not authenticated');
        }

        const url = `${CONFIG.GITHUB_API_URL}/${filename}`;

        return this.request(url, {
            method: 'DELETE',
            body: JSON.stringify({
                message: `Remove product: ${filename}`,
                sha: sha,
            }),
        });
    },

    /**
     * Validate token by making a test API call
     */
    async validateToken(token) {
        try {
            const response = await fetch('https://api.github.com/user', {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                },
            });

            if (!response.ok) return false;

            // Check repo access
            const repoResponse = await fetch(
                `https://api.github.com/repos/${CONFIG.GITHUB_USERNAME}/${CONFIG.GITHUB_REPO}`,
                {
                    headers: {
                        'Authorization': `token ${token}`,
                        'Accept': 'application/vnd.github.v3+json',
                    },
                }
            );

            return repoResponse.ok;
        } catch (error) {
            return false;
        }
    },

    /**
     * Convert file to base64
     */
    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },
};

// Initialize on load
GitHubAPI.init();
