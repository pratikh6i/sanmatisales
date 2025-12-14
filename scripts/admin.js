/**
 * Admin Panel Logic
 * Handles image management with debounced saves
 */
const Admin = {
    isInitialized: false,
    products: [],
    metadata: {},
    isReorderMode: false,
    isSaving: false,
    saveDebounceTimer: null,
    isUploadCancelled: false,

    /**
     * Initialize admin panel
     */
    init() {
        if (this.isInitialized) return;
        this.isInitialized = true;

        this.setupEventListeners();
        this.checkAuth();
    },

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        document.getElementById('adminLogout').addEventListener('click', () => this.logout());

        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        const uploadZone = document.getElementById('uploadZone');
        const fileInput = document.getElementById('fileInput');

        uploadZone.addEventListener('click', () => fileInput.click());

        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('drag-over');
        });

        uploadZone.addEventListener('dragleave', () => {
            uploadZone.classList.remove('drag-over');
        });

        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('drag-over');
            this.handleFiles(e.dataTransfer.files);
        });

        fileInput.addEventListener('change', (e) => {
            this.handleFiles(e.target.files);
            fileInput.value = '';
        });

        const reorderToggle = document.getElementById('reorderToggle');
        if (reorderToggle) {
            reorderToggle.addEventListener('click', () => this.toggleReorderMode());
        }

        // Trusted By toggle
        const trustedToggle = document.getElementById('trustedToggle');
        if (trustedToggle) {
            trustedToggle.addEventListener('click', () => this.toggleTrustedBy());
        }

        // Cancel upload button
        const cancelBtn = document.getElementById('cancelUpload');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.isUploadCancelled = true;
                App.showToast('Upload cancelled', 'error');
            });
        }
    },

    /**
     * Toggle Trusted By section visibility
     */
    async toggleTrustedBy() {
        const toggle = document.getElementById('trustedToggle');
        const isHidden = this.metadata._hideTrustedBy === true;

        this.metadata._hideTrustedBy = !isHidden;

        toggle.innerHTML = this.metadata._hideTrustedBy
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/><line x1="1" y1="1" x2="23" y2="23"/></svg><span>Show "Trusted By"</span>`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg><span>Hide "Trusted By"</span>`;

        await this.saveMetadataToGitHub();
        App.applyTrustedByVisibility();
        App.showToast(this.metadata._hideTrustedBy ? 'Trusted By hidden' : 'Trusted By visible', 'success');
    },

    /**
     * Toggle reorder mode
     */
    toggleReorderMode() {
        this.isReorderMode = !this.isReorderMode;
        const toggle = document.getElementById('reorderToggle');
        const imagesGrid = document.getElementById('imagesGrid');

        if (this.isReorderMode) {
            toggle.classList.add('active');
            toggle.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><span>${Lang.get('saveOrder')}</span>`;
            imagesGrid.classList.add('reorder-mode');
            this.attachReorderListeners();
            App.showToast(Lang.get('useArrows'), 'success');
        } else {
            toggle.classList.remove('active');
            toggle.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg><span>${Lang.get('reorderImages')}</span>`;
            imagesGrid.classList.remove('reorder-mode');
            this.saveProductOrder();
        }
    },

    attachReorderListeners() {
        const grid = document.getElementById('imagesGrid');

        grid.querySelectorAll('.move-up-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const item = btn.closest('.image-item');
                const prev = item.previousElementSibling;
                if (prev) {
                    item.parentNode.insertBefore(item, prev);
                    this.flashItem(item);
                    this.updatePositionBadges();
                }
            };
        });

        grid.querySelectorAll('.move-down-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const item = btn.closest('.image-item');
                const next = item.nextElementSibling;
                if (next) {
                    item.parentNode.insertBefore(next, item);
                    this.flashItem(item);
                    this.updatePositionBadges();
                }
            };
        });
    },

    updatePositionBadges() {
        const items = document.querySelectorAll('.image-item');
        items.forEach((item, index) => {
            const badge = item.querySelector('.position-badge');
            if (badge) badge.textContent = index + 1;

            const upBtn = item.querySelector('.move-up-btn');
            const downBtn = item.querySelector('.move-down-btn');

            if (upBtn) {
                upBtn.disabled = index === 0;
                upBtn.classList.toggle('disabled', index === 0);
            }
            if (downBtn) {
                downBtn.disabled = index === items.length - 1;
                downBtn.classList.toggle('disabled', index === items.length - 1);
            }
        });
    },

    flashItem(item) {
        item.style.transform = 'scale(1.03)';
        item.style.boxShadow = '0 0 25px rgba(0, 180, 216, 0.6)';
        setTimeout(() => {
            item.style.transform = '';
            item.style.boxShadow = '';
        }, 250);
    },

    debouncedSave(callback, delay = 1000) {
        clearTimeout(this.saveDebounceTimer);
        this.saveDebounceTimer = setTimeout(callback, delay);
    },

    async saveProductOrder() {
        const grid = document.getElementById('imagesGrid');
        const items = grid.querySelectorAll('.image-item');
        const order = [...items].map(item => item.dataset.filename);

        this.metadata._order = order;

        this.debouncedSave(async () => {
            try {
                await this.saveMetadataToGitHub();
                App.showToast(Lang.get('orderSaved'), 'success');
                App.loadProducts();
            } catch (error) {
                console.error('Failed to save order:', error);
                App.showToast('Failed to save order', 'error');
            }
        }, 500);
    },

    async saveMetadataToGitHub() {
        if (this.isSaving) {
            return new Promise((resolve, reject) => {
                setTimeout(async () => {
                    try {
                        await this.saveMetadataToGitHub();
                        resolve();
                    } catch (e) {
                        reject(e);
                    }
                }, 1500);
            });
        }

        this.isSaving = true;
        try {
            await GitHubAPI.saveMetadata(this.metadata);
        } finally {
            this.isSaving = false;
        }
    },

    checkAuth() {
        GitHubAPI.init();

        if (GitHubAPI.isAuthenticated()) {
            this.showManager();
            this.loadProducts();
        } else {
            this.showLogin();
        }
    },

    async handleLogin() {
        const tokenInput = document.getElementById('githubToken');
        const token = tokenInput.value.trim();

        if (!token) {
            App.showToast('Please enter your GitHub token', 'error');
            return;
        }

        const submitBtn = document.querySelector('#loginForm button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Verifying...</span>';

        const isValid = await GitHubAPI.validateToken(token);

        if (isValid) {
            GitHubAPI.setToken(token);
            this.showManager();
            await this.loadProducts();
            App.showToast(Lang.get('loginSuccess'), 'success');
        } else {
            App.showToast('Invalid token or no repo access', 'error');
        }

        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>${Lang.get('login')}</span>`;
        tokenInput.value = '';
    },

    showLogin() {
        document.getElementById('adminLogin').classList.remove('hidden');
        document.getElementById('adminManager').classList.add('hidden');
    },

    showManager() {
        document.getElementById('adminLogin').classList.add('hidden');
        document.getElementById('adminManager').classList.remove('hidden');
        this.updateTrustedToggleState();
    },

    updateTrustedToggleState() {
        const toggle = document.getElementById('trustedToggle');
        if (toggle && this.metadata) {
            toggle.innerHTML = this.metadata._hideTrustedBy
                ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/><line x1="1" y1="1" x2="23" y2="23"/></svg><span>Show "Trusted By"</span>`
                : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg><span>Hide "Trusted By"</span>`;
        }
    },

    async loadProducts() {
        const imagesGrid = document.getElementById('imagesGrid');
        imagesGrid.innerHTML = '<div class="loading-state"><div class="loader"><div class="loader-ring"></div><div class="loader-ring"></div></div><p>Loading...</p></div>';

        try {
            const [products, metadata] = await Promise.all([
                GitHubAPI.fetchProducts(),
                GitHubAPI.fetchMetadata(),
            ]);

            this.products = products;
            this.metadata = metadata;
            this.updateTrustedToggleState();

            if (products.length === 0) {
                imagesGrid.innerHTML = `
                    <div style="grid-column: 1/-1; text-align: center; padding: var(--space-8); color: var(--gray-500);">
                        <p>No images yet. Upload your first product!</p>
                    </div>
                `;
                return;
            }

            let sortedProducts = products;
            if (metadata._order && Array.isArray(metadata._order)) {
                sortedProducts = [...products].sort((a, b) => {
                    const indexA = metadata._order.indexOf(a.name);
                    const indexB = metadata._order.indexOf(b.name);
                    if (indexA === -1) return 1;
                    if (indexB === -1) return -1;
                    return indexA - indexB;
                });
            }

            imagesGrid.innerHTML = sortedProducts.map((product, index) =>
                this.renderImageItem(product, index, sortedProducts.length)
            ).join('');

            this.attachImageEventListeners();
            if (this.isReorderMode) {
                this.attachReorderListeners();
            }

        } catch (error) {
            console.error('Failed to load products:', error);
            imagesGrid.innerHTML = '<p style="text-align: center; color: var(--error);">Failed to load images.</p>';
        }
    },

    renderImageItem(product, index, total) {
        const displayName = this.metadata[product.name] || '';
        const isVideo = CONFIG.VIDEO_EXTENSIONS.some(ext =>
            product.name.toLowerCase().endsWith(`.${ext}`)
        );
        const isFirst = index === 0;
        const isLast = index === total - 1;

        return `
            <div class="image-item" data-filename="${product.name}" data-sha="${product.sha}">
                <div class="reorder-controls">
                    <button class="reorder-btn move-up-btn ${isFirst ? 'disabled' : ''}" ${isFirst ? 'disabled' : ''}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                            <path d="M18 15l-6-6-6 6"/>
                        </svg>
                        <span>Up</span>
                    </button>
                    <span class="position-badge">${index + 1}</span>
                    <button class="reorder-btn move-down-btn ${isLast ? 'disabled' : ''}" ${isLast ? 'disabled' : ''}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                            <path d="M6 9l6 6 6-6"/>
                        </svg>
                        <span>Down</span>
                    </button>
                </div>
                <div class="image-preview">
                    ${isVideo
                ? `<video src="${product.rawUrl}" muted loop></video>`
                : `<img src="${product.rawUrl}" alt="${displayName || product.name}">`
            }
                </div>
                <div class="image-controls">
                    <input 
                        type="text" 
                        class="image-name-input" 
                        placeholder="${Lang.get('enterName')}"
                        value="${displayName}"
                    >
                    <div class="image-actions">
                        <button class="btn-save">${Lang.get('save')}</button>
                        <button class="btn-delete">${Lang.get('delete')}</button>
                    </div>
                </div>
            </div>
        `;
    },

    attachImageEventListeners() {
        const imagesGrid = document.getElementById('imagesGrid');

        imagesGrid.querySelectorAll('.btn-save').forEach(btn => {
            btn.addEventListener('click', async () => {
                const imageItem = btn.closest('.image-item');
                const filename = imageItem.dataset.filename;
                const input = imageItem.querySelector('.image-name-input');
                await this.saveImageName(filename, input.value.trim(), btn);
            });
        });

        imagesGrid.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', async () => {
                const imageItem = btn.closest('.image-item');
                const filename = imageItem.dataset.filename;
                const sha = imageItem.dataset.sha;

                if (confirm(`Delete "${filename}"?`)) {
                    await this.deleteImage(filename, sha, imageItem);
                }
            });
        });

        imagesGrid.querySelectorAll('.image-name-input').forEach(input => {
            input.addEventListener('keydown', async (e) => {
                if (e.key === 'Enter') {
                    const imageItem = input.closest('.image-item');
                    const filename = imageItem.dataset.filename;
                    const btn = imageItem.querySelector('.btn-save');
                    await this.saveImageName(filename, input.value.trim(), btn);
                }
            });
        });
    },

    async saveImageName(filename, displayName, btn) {
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = '...';

        try {
            if (displayName) {
                this.metadata[filename] = displayName;
            } else {
                delete this.metadata[filename];
            }

            await this.saveMetadataToGitHub();
            App.showToast(Lang.get('nameSaved'), 'success');
            App.metadata = { ...this.metadata };
        } catch (error) {
            App.showToast('Failed to save - please try again', 'error');
        }

        btn.disabled = false;
        btn.textContent = originalText;
    },

    async deleteImage(filename, sha, imageItem) {
        const deleteBtn = imageItem.querySelector('.btn-delete');
        deleteBtn.disabled = true;
        deleteBtn.textContent = '...';

        try {
            await GitHubAPI.deleteImage(filename, sha);

            this.products = this.products.filter(p => p.name !== filename);
            delete this.metadata[filename];
            if (this.metadata._order) {
                this.metadata._order = this.metadata._order.filter(n => n !== filename);
            }

            imageItem.style.opacity = '0';
            imageItem.style.transform = 'scale(0.8)';
            setTimeout(() => imageItem.remove(), 300);

            App.showToast(Lang.get('imageDeleted'), 'success');
            App.loadProducts();

        } catch (error) {
            App.showToast('Failed to delete', 'error');
            deleteBtn.disabled = false;
            deleteBtn.textContent = Lang.get('delete');
        }
    },

    /**
     * Handle multiple file uploads - FIXED for multiple images
     */
    async handleFiles(files) {
        if (!files || files.length === 0) return;

        const filesArray = Array.from(files);

        const uploadProgress = document.getElementById('uploadProgress');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');

        uploadProgress.classList.remove('hidden');
        this.isUploadCancelled = false; // Reset cancel flag

        const totalFiles = filesArray.length;
        let completed = 0;
        let failed = 0;

        // Upload files sequentially to avoid conflicts
        for (const file of filesArray) {
            // Check if cancelled
            if (this.isUploadCancelled) {
                progressText.textContent = 'Cancelled';
                break;
            }

            try {
                progressText.textContent = `Uploading ${file.name} (${completed + 1}/${totalFiles})...`;
                await GitHubAPI.uploadImage(file);
                completed++;
                progressFill.style.width = `${Math.round((completed / totalFiles) * 100)}%`;

                // Small delay between uploads to prevent API rate limits
                if (completed < totalFiles) {
                    await new Promise(r => setTimeout(r, 300));
                }
            } catch (error) {
                console.error(`Failed to upload ${file.name}:`, error);
                failed++;
                App.showToast(`Failed: ${file.name}`, 'error');
            }
        }

        if (!this.isUploadCancelled) {
            progressText.textContent = 'Complete!';
        }

        setTimeout(() => {
            uploadProgress.classList.add('hidden');
            progressFill.style.width = '0%';
            this.isUploadCancelled = false;
        }, 1000);

        if (completed > 0) {
            App.showToast(`Uploaded ${completed} file${completed > 1 ? 's' : ''}!`, 'success');
            // Refresh BOTH admin and public views
            await this.loadProducts();
            await App.loadProducts();
        }
    },

    logout() {
        GitHubAPI.clearToken();
        this.showLogin();
        App.closeAdminPanel();
        App.showToast(Lang.get('loggedOut'), 'success');
    },
};
