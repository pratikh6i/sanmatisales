/**
 * Main Application Logic
 * Handles public website functionality with progressive loading
 */
const App = {
    products: [],
    metadata: {},
    currentProduct: null,

    /**
     * Initialize the application
     */
    async init() {
        // Initialize language system
        Lang.init();

        this.setupEventListeners();
        this.setupScrollEffects();
        this.loadCustomerLogo();
        await this.loadProducts();
        this.initializeMap();
    },

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Smooth scroll for anchor links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', (e) => {
                const targetId = anchor.getAttribute('href');
                const target = document.querySelector(targetId);
                if (target) {
                    e.preventDefault();
                    target.scrollIntoView({ behavior: 'smooth' });
                }
            });
        });

        // Admin dropdown toggle
        const adminDropdown = document.getElementById('adminDropdown');
        const adminTrigger = document.getElementById('adminTrigger');
        const openAdminBtn = document.getElementById('openAdminBtn');

        if (adminTrigger) {
            adminTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                adminDropdown.classList.toggle('open');
            });

            // Close on outside click
            document.addEventListener('click', () => {
                adminDropdown.classList.remove('open');
            });
        }

        if (openAdminBtn) {
            openAdminBtn.addEventListener('click', () => {
                this.openAdminPanel();
                adminDropdown.classList.remove('open');
            });
        }

        // Admin panel close
        const adminClose = document.getElementById('adminClose');
        if (adminClose) {
            adminClose.addEventListener('click', () => this.closeAdminPanel());
        }

        // Modal close
        document.getElementById('modalClose').addEventListener('click', () => this.closeModal());
        document.querySelector('.modal-backdrop').addEventListener('click', () => this.closeModal());

        // Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
                this.closeAdminPanel();
            }
        });

        // Modal WhatsApp button
        document.getElementById('modalWhatsapp').addEventListener('click', () => {
            if (this.currentProduct) {
                this.openWhatsApp(this.currentProduct.displayName, this.currentProduct.rawUrl);
            }
        });

        // Language toggle button
        const langToggle = document.getElementById('langToggle');
        if (langToggle) {
            langToggle.addEventListener('click', () => {
                Lang.toggle();
            });
        }
    },

    /**
     * Setup scroll effects
     */
    setupScrollEffects() {
        const header = document.getElementById('header');

        window.addEventListener('scroll', () => {
            if (window.scrollY > 50) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }
        });
    },

    /**
     * Load customer logo if available
     */
    loadCustomerLogo() {
        const logoIcon = document.getElementById('logoIcon');
        const footerLogo = document.getElementById('footerLogo');

        const img = new Image();
        img.onload = () => {
            // Logo exists, replace SVG with image
            if (logoIcon) {
                logoIcon.innerHTML = `<img src="${CONFIG.LOGO_URL}" alt="Sanmati Sales Logo">`;
            }
            if (footerLogo) {
                footerLogo.innerHTML = `<img src="${CONFIG.LOGO_URL}" alt="Sanmati Sales Logo">`;
            }
        };
        img.onerror = () => {
            // Logo doesn't exist, keep default SVG
            console.log('Customer logo not found, using default');
        };
        img.src = CONFIG.LOGO_URL;
    },

    /**
     * Load products from GitHub
     */
    async loadProducts() {
        const loadingState = document.getElementById('loadingState');
        const emptyState = document.getElementById('emptyState');
        const productsGrid = document.getElementById('productsGrid');

        try {
            const [products, metadata] = await Promise.all([
                GitHubAPI.fetchProducts(),
                GitHubAPI.fetchMetadata(),
            ]);

            this.products = products;
            this.metadata = metadata;

            loadingState.classList.add('hidden');

            if (products.length === 0) {
                emptyState.classList.remove('hidden');
                return;
            }

            // Sort by saved order if available
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

            this.products = sortedProducts;

            // Render products with progressive loading
            productsGrid.innerHTML = sortedProducts.map(product =>
                this.renderProductCard(product)
            ).join('');

            // Setup progressive image loading
            this.setupProgressiveLoading();

            // Apply Trusted By visibility setting
            this.applyTrustedByVisibility();

            // Attach event listeners
            productsGrid.querySelectorAll('.product-card').forEach((card, index) => {
                card.addEventListener('click', (e) => {
                    if (!e.target.closest('.action-btn')) {
                        this.openProductModal(this.products[index]);
                    }
                });

                const whatsappBtn = card.querySelector('.action-btn');
                if (whatsappBtn) {
                    whatsappBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const product = this.products[index];
                        const displayName = this.getDisplayName(product.name);
                        this.openWhatsApp(displayName, product.rawUrl);
                    });
                }
            });

        } catch (error) {
            console.error('Failed to load products:', error);
            loadingState.innerHTML = `
                <p style="color: var(--error);">Failed to load products. Please try again later.</p>
            `;
        }
    },

    /**
     * Setup progressive image loading
     */
    setupProgressiveLoading() {
        const images = document.querySelectorAll('.product-card-image');

        images.forEach(img => {
            // Check if already loaded (cached)
            if (img.complete) {
                img.classList.add('loaded');
            } else {
                img.addEventListener('load', () => {
                    img.classList.add('loaded');
                });
            }
        });
    },

    /**
     * Apply Trusted By visibility from metadata
     */
    applyTrustedByVisibility() {
        const trustedBySection = document.querySelector('.trusted-by');
        if (trustedBySection && this.metadata) {
            if (this.metadata._hideTrustedBy === true) {
                trustedBySection.style.display = 'none';
            } else {
                trustedBySection.style.display = '';
            }
        }
    },

    /**
     * Get display name for a product
     */
    getDisplayName(filename) {
        if (this.metadata[filename]) {
            return this.metadata[filename];
        }

        let name = filename.replace(/\.[^/.]+$/, '');

        const prefixes = [
            /^Gemini_Generated_Image_/i,
            /^unnamed\s*\(?[\d]*\)?/i,
            /^product_/i,
            /^image_/i,
            /^IMG_/i,
            /^DSC_/i,
            /^\d+_/,
        ];

        prefixes.forEach(prefix => {
            name = name.replace(prefix, '');
        });

        name = name.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
        name = name.replace(/\b\w/g, l => l.toUpperCase());

        if (name.length < 3) {
            name = 'Premium Tool';
        }

        return name;
    },

    /**
     * Render a product card with progressive loading
     */
    renderProductCard(product) {
        const displayName = this.getDisplayName(product.name);
        const isVideo = CONFIG.VIDEO_EXTENSIONS.some(ext =>
            product.name.toLowerCase().endsWith(`.${ext}`)
        );

        return `
            <article class="product-card" data-filename="${product.name}">
                <div class="product-card-image-wrapper">
                    ${isVideo ? `
                        <video class="product-card-image loaded" src="${product.rawUrl}" muted loop></video>
                    ` : `
                        <img 
                            class="product-card-image" 
                            src="${product.rawUrl}" 
                            alt="${displayName}"
                            loading="lazy"
                        >
                        <div class="product-card-placeholder"></div>
                    `}
                </div>
                <div class="product-card-overlay">
                    <h3 class="product-card-name">${displayName}</h3>
                    <div class="product-card-delivery">
                        <span>🚚</span>
                        <span>FREE Delivery</span>
                    </div>
                </div>
                <div class="product-card-actions">
                    <button class="action-btn whatsapp-btn" title="Enquire on WhatsApp">
                        <img src="${CONFIG.WHATSAPP_LOGO_URL}" alt="WhatsApp" class="whatsapp-logo" onerror="this.style.display='none';this.nextElementSibling.style.display='block';">
                        <svg viewBox="0 0 24 24" fill="currentColor" style="display:none;">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/>
                        </svg>
                    </button>
                </div>
            </article>
        `;
    },

    /**
     * Initialize the coverage map
     */
    initializeMap() {
        const mapContainer = document.getElementById('coverage-map');
        if (!mapContainer || typeof L === 'undefined') return;

        // Center on Kumbhoj
        const map = L.map('coverage-map', {
            center: [16.7361, 74.3708],
            zoom: 10,
            scrollWheelZoom: false,
        });

        // Use OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap',
            maxZoom: 18,
        }).addTo(map);

        // Red location marker icon
        const markerIcon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="
                width: 28px;
                height: 36px;
                position: relative;
            ">
                <svg viewBox="0 0 24 36" fill="#e53935" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: 100%; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 24 12 24s12-15 12-24c0-6.63-5.37-12-12-12zm0 16.5c-2.49 0-4.5-2.01-4.5-4.5s2.01-4.5 4.5-4.5 4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5z"/>
                </svg>
            </div>`,
            iconSize: [28, 36],
            iconAnchor: [14, 36],
            popupAnchor: [0, -36],
        });

        // Add markers for all locations
        CONFIG.MAP_LOCATIONS.forEach(location => {
            L.marker([location.lat, location.lng], { icon: markerIcon })
                .addTo(map)
                .bindPopup(`<strong>${location.name}</strong><br>Delivery Available`);
        });

        // Enable scroll zoom on focus
        map.on('click', () => {
            map.scrollWheelZoom.enable();
        });

        map.on('mouseout', () => {
            map.scrollWheelZoom.disable();
        });
    },

    /**
     * Open product modal
     */
    openProductModal(product) {
        const displayName = this.getDisplayName(product.name);
        this.currentProduct = { ...product, displayName };

        const modal = document.getElementById('productModal');
        const modalMedia = document.getElementById('modalMedia');
        const modalTitle = document.getElementById('modalTitle');

        const isVideo = CONFIG.VIDEO_EXTENSIONS.some(ext =>
            product.name.toLowerCase().endsWith(`.${ext}`)
        );

        if (isVideo) {
            modalMedia.innerHTML = `<video src="${product.rawUrl}" controls autoplay muted></video>`;
        } else {
            modalMedia.innerHTML = `<img src="${product.rawUrl}" alt="${displayName}">`;
        }

        modalTitle.textContent = displayName;

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    },

    /**
     * Close product modal
     */
    closeModal() {
        const modal = document.getElementById('productModal');
        modal.classList.remove('active');
        document.body.style.overflow = '';
        this.currentProduct = null;
    },

    /**
     * Open WhatsApp with pre-filled message
     */
    openWhatsApp(productName, imageUrl) {
        const message = `Hi! I'm interested in this product:

*${productName}*

📷 View: ${imageUrl}

🚚 Is home delivery available?`;

        const url = `https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    },

    /**
     * Open admin panel
     */
    openAdminPanel() {
        const adminPanel = document.getElementById('adminPanel');
        adminPanel.classList.remove('hidden');
        document.body.style.overflow = 'hidden';

        if (typeof Admin !== 'undefined') {
            Admin.init();
        }
    },

    /**
     * Close admin panel
     */
    closeAdminPanel() {
        const adminPanel = document.getElementById('adminPanel');
        adminPanel.classList.add('hidden');
        document.body.style.overflow = '';
    },

    /**
     * Show toast notification
     */
    showToast(message, type = 'success') {
        const container = document.getElementById('toastContainer');

        const icons = {
            success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
            error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
        };

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `${icons[type] || ''}<span>${message}</span>`;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'toastSlideIn 0.3s ease-out reverse';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    },
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => App.init());
