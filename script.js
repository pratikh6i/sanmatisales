document.addEventListener('DOMContentLoaded', () => {

    // --- ⭐ FINAL CONFIGURATION (FOR GITHUB & GOOGLE SHEETS) ⭐ ---
    const GITHUB_USERNAME = 'pratikh6i';
    const GITHUB_REPO = 'sanmatisales';
    const WHATSAPP_NUMBER = '918530515022';
    // ⚠️ IMPORTANT: Paste your NEWEST deployed Web App URL here.
    const WEB_APP_URL = 'https://script.google.com/';
    const PRODUCTS_FOLDER = 'products';
    const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents/${PRODUCTS_FOLDER}`;
    // --- END OF CONFIGURATION ---

    // --- Element Selectors ---
    const galleryContainer = document.getElementById('gallery-container');
    const statusMessage = document.getElementById('statusMessage');
    const header = document.getElementById('main-header');
    const fullscreenModal = document.getElementById('fullscreen-modal');
    const modalContent = document.getElementById('modal-content');
    const closeModalBtn = document.querySelector('.close-button');

    // --- State Management ---
    let userId = getUserId();
    let userVotes = JSON.parse(localStorage.getItem('userVotes')) || {};
    let viewStartTime = null;
    let currentVisibleProduct = null;
    let currentlyGlowingCard = null;
    const colorThief = new ColorThief();

    // --- Initial Setup ---
    fetchAndDisplayProducts();

    function getUserId() {
        let id = localStorage.getItem('sparkChoiceUserId');
        if (!id) {
            id = Date.now().toString(36) + Math.random().toString(36).substring(2);
            localStorage.setItem('sparkChoiceUserId', id);
        }
        return id;
    }

    async function fetchAndDisplayProducts() {
        try {
            const response = await fetch(GITHUB_API_URL);
            if (!response.ok) throw new Error(`GitHub API Error: ${response.status}. Check username/repo.`);
            const files = await response.json();
            const mediaFiles = files.filter(file => file.type === 'file' && /\.(jpe?g|png|gif|webp|mp4|webm|mov)$/i.test(file.name));

            if (!mediaFiles || mediaFiles.length === 0) {
                displayMessage("No products found. Add media to the 'products' folder on GitHub.");
                return;
            }
            
            statusMessage.style.display = 'none';
            galleryContainer.innerHTML = '';

            const headerHeight = header.offsetHeight || 70;
            document.documentElement.style.setProperty('--header-height', `${headerHeight}px`);
            
            galleryContainer.appendChild(createIntroCard());
            mediaFiles.forEach(file => galleryContainer.appendChild(createProductCard(file.name, file.download_url)));
            galleryContainer.appendChild(createEndCard());

            setupIntersectionObserver();
        } catch (error) {
            console.error('Failed to fetch products:', error);
            displayMessage(error.message);
        }
    }

    function createProductCard(filename, fileUrl) {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.dataset.filename = filename;

        const productName = filename.split('.')[0].replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        card.dataset.name = productName.toLowerCase();
        
        const isVideo = /\.(mp4|webm|mov)$/i.test(filename);
        let mediaElement = document.createElement(isVideo ? 'video' : 'img');
        
        if (isVideo) {
            Object.assign(mediaElement, { src: fileUrl, autoplay: true, loop: true, muted: true, playsInline: true });
        } else {
            Object.assign(mediaElement, { src: fileUrl, alt: productName, loading: 'lazy', crossOrigin: "Anonymous" });
            mediaElement.addEventListener('load', () => card.dataset.isImageLoaded = 'true');
        }
        mediaElement.className = 'product-card-media';
        
        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'product-card-actions';

        const likeBtn = createActionButton('like', handleVote);
        const whatsappBtn = createActionButton('whatsapp', () => {
            const text = `Hi, I'm interested in this product: ${productName}`;
            window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`, '_blank');
        });

        if (userVotes[filename] === 'like') likeBtn.classList.add('voted');
        
        actionsContainer.append(likeBtn, whatsappBtn);
        card.append(mediaElement, actionsContainer);

        mediaElement.addEventListener('click', () => openModal(fileUrl, isVideo));
        return card;
    }

    function createActionButton(type, onClickHandler) {
        const button = document.createElement('button');
        button.className = `action-button ${type}-btn`;
        button.dataset.type = type;
        const icons = {
            like: `<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`,
            whatsapp: `<img src="https://raw.githubusercontent.com/pratikh6i/my-products/main/products/statick-media/WhatsApp%20Messenger.webp" alt="WhatsApp">`
        };
        button.innerHTML = icons[type];
        button.addEventListener('click', onClickHandler);
        return button;
    }

    function setupIntersectionObserver() {
        const options = { root: null, threshold: 0.6 };
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const card = entry.target;
                if (!card.dataset.filename) return;
                
                if (entry.isIntersecting) {
                    const filename = card.dataset.filename;
                    if (currentVisibleProduct !== filename) {
                        logViewDuration();
                        currentVisibleProduct = filename;
                        viewStartTime = Date.now();
                        
                        const img = card.querySelector('img');
                        if (img && card.dataset.isImageLoaded === 'true') {
                            updateGlow(card, img);
                        } else {
                            updateGlow(card, null); // Reset for videos
                        }
                    }
                }
            });
        }, options);
        document.querySelectorAll('.product-card').forEach(card => observer.observe(card));
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') logViewDuration(); });
    }

    function handleVote(e) {
        const button = e.currentTarget;
        const card = button.closest('.product-card');
        const filename = card.dataset.filename;
        const currentVote = userVotes[filename];
        let newAction = 'like';
        if (currentVote === 'like') {
            newAction = 'unlike';
        }
        userVotes[filename] = (newAction === 'like') ? 'like' : undefined;
        localStorage.setItem('userVotes', JSON.stringify(userVotes));
        updateVoteUI(card, newAction);
        sendDataToSheet('vote', {
            userId: userId,
            filename: filename,
            action: newAction,
            timestamp: new Date().toISOString()
        });
    }

    function logViewDuration() {
        if (viewStartTime && currentVisibleProduct) {
            const duration = Date.now() - viewStartTime;
            if (duration > 1000) {
                sendDataToSheet('view', {
                    userId: userId,
                    filename: currentVisibleProduct,
                    duration: duration,
                    timestamp: new Date().toISOString()
                });
            }
        }
        viewStartTime = null;
        currentVisibleProduct = null;
    }
    
    async function sendDataToSheet(type, payload) {
        if (!WEB_APP_URL || WEB_APP_URL.includes('PASTE_YOUR')) {
            console.warn('Analytics Disabled: Please set your WEB_APP_URL in script.js', payload);
            return;
        }
        try {
            const response = await fetch(WEB_APP_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ type, ...payload })
            });
        } catch (error) {
            console.error('Network error sending analytics:', error);
        }
    }

    function displayMessage(message) {
        statusMessage.style.display = 'flex';
        statusMessage.innerHTML = `<p>${message}</p>`;
    }

    function updateVoteUI(card, action) {
        const likeBtn = card.querySelector('.like-btn');
        if (action === 'like') {
            likeBtn.classList.add('voted');
        } else {
            likeBtn.classList.remove('voted');
        }
    }

    function openModal(src, isVideo) {
        modalContent.innerHTML = '';
        let mediaElement = document.createElement(isVideo ? 'video' : 'img');
        mediaElement.src = src;
        if (isVideo) {
            mediaElement.controls = true;
            mediaElement.autoplay = true;
        }
        modalContent.appendChild(mediaElement);
        fullscreenModal.classList.add('visible');
    }

    function closeModal() {
        fullscreenModal.classList.remove('visible');
        modalContent.innerHTML = '';
    }

    function updateGlow(card, img) {
        if (currentlyGlowingCard && currentlyGlowingCard !== card) {
            currentlyGlowingCard.classList.remove('is-glowing');
        }
        let gradient = 'radial-gradient(circle, #F1C40F 0%, transparent 70%)';
        if (img) {
            try {
                const palette = colorThief.getPalette(img, 5);
                if (palette && palette.length >= 2) {
                    const color1 = `rgb(${palette[0].join(',')})`;
                    const color2 = `rgb(${palette[1].join(',')})`;
                    const color3 = `rgb(${palette[palette.length - 1].join(',')})`;
                    gradient = `conic-gradient(from 90deg at 50% 50%, ${color1}, ${color2}, ${color3}, ${color1})`;
                }
            } catch (e) {
                console.warn('ColorThief could not process image.', e);
            }
        }
        card.style.setProperty('--glow-gradient', gradient);
        card.classList.add('is-glowing');
        currentlyGlowingCard = card;
    }

    function createIntroCard() {
        const card = document.createElement('div');
        card.className = 'intro-card';
        card.innerHTML = `
            <div>
                <h2 style="font-weight: 600; font-size: 1.8rem; margin-bottom: 0.5rem;">Welcome to the Sanmati Sales</h2>
                <p style="opacity: 0.8;">Scroll to explore the latest products. . . ⬇️</p>
            </div>
        `;
        return card;
    }

    function createEndCard() {
        const card = document.createElement('div');
        card.className = 'end-card';
        card.innerHTML = `
            <div>
                <h2 style="font-weight: 600; font-size: 1.8rem; margin-bottom: 0.5rem;">You've Reached the End</h2>
                <p style="opacity: 0.8; margin-bottom: 2rem;">Thank you for exploring the collection.</p>
                <button id="scrollToTopBtn">Back to Top</button>
            </div>
        `;
        card.querySelector('#scrollToTopBtn').addEventListener('click', () => {
            galleryContainer.scrollTo({ top: 0, behavior: 'smooth' });
        });
        return card;
    }

    // --- Event Listeners ---
    closeModalBtn.addEventListener('click', closeModal);
    fullscreenModal.addEventListener('click', (e) => {
        if (e.target === fullscreenModal) closeModal();
    });
});