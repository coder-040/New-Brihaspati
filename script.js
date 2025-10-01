// Firebase setup loaded from firebase-config.js. No config in this file.

// Global Variables
let cart = [];
let currentSlide = 0;
let slideInterval;
let isLoggedIn = false;
let currentUser = null;
let authInitialized = false;
let authResolved = false; // prevents showing login modal before auth state is known

// Prefer redirect over popup for Google sign-in to avoid popup blockers
const GOOGLE_LOGIN_MODE = 'popup'; // use popup to avoid redirect loops

// Firebase services are initialized in firebase-config.js

// Firebase services are initialized in firebase-config.js
// Access them through window.firebaseServices
// Use services provided by firebase-config.js
const auth = window.firebaseServices && window.firebaseServices.auth ? window.firebaseServices.auth : null;
const db = window.firebaseServices && window.firebaseServices.db ? window.firebaseServices.db : null;
const googleProvider = window.firebaseServices && window.firebaseServices.googleProvider ? window.firebaseServices.googleProvider : null;
// Google provider custom parameters are set at login time to avoid unnecessary prompts
const ordersCollection = window.firebaseServices && window.firebaseServices.ordersCollection ? window.firebaseServices.ordersCollection : (db ? db.collection('orders') : null);
const contactMessagesCollection = window.firebaseServices && window.firebaseServices.contactMessagesCollection ? window.firebaseServices.contactMessagesCollection : (db ? db.collection('contactMessages') : null);
// Firestore cart reference per user
function getUserCartDoc(uid) {
    try {
        return db.collection('carts').doc(uid);
    } catch (_) {
        return null;
    }
}

async function loadCartForUser(uid) {
    const docRef = getUserCartDoc(uid);
    if (!docRef) return;
    try {
        const snap = await docRef.get();
        if (snap.exists) {
            const data = snap.data();
            if (Array.isArray(data.items)) {
                cart = data.items;
                updateCartDisplay();
                saveCartToStorage(); // keep local mirror
            }
        } else {
            // Seed with local cart if any, else empty
            await saveCartForUser(uid);
        }
    } catch (e) {
        if (e && e.code === 'permission-denied') {
            console.warn('Cart read denied by Firestore rules. Skipping server cart load.');
            return;
        }
        console.warn('Failed to load user cart:', e);
    }
}

async function saveCartForUser(uid) {
    const docRef = getUserCartDoc(uid);
    if (!docRef) return;
    try {
        await docRef.set({
            items: cart,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    } catch (e) {
        if (e && e.code === 'permission-denied') {
            console.warn('Cart write denied by Firestore rules. Continuing with local cart only.');
            return;
        }
        console.warn('Failed to save user cart:', e);
    }
}

/*
STEP 6: TEST YOUR SETUP
1. Open your website
2. Try logging in with email/password
3. Try Google login
4. Check Firebase Console > Authentication > Users to see registered users

TROUBLESHOOTING:
- Make sure Firebase SDK scripts are uncommented in index.html
- Verify Firebase config is correct
- Check browser console for errors
- Ensure authorized domains include your domain
- For Google login, make sure Google provider is enabled

SECURITY NOTES:
- Never commit your Firebase config with real API keys to public repos
- Use environment variables in production
- Set up Firebase Security Rules for your database
- Enable App Check for additional security

===========================================
*/

// Login Modal Management
function navigateToHome() {
    try {
        // Clear search and show featured products
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.value = '';
        }
        const slideshow = document.querySelector('.slideshow-container');
        const aboutSection = document.querySelector('.about-section');
        if (slideshow) slideshow.style.display = 'block';
        if (aboutSection) aboutSection.style.display = 'block';
        if (typeof loadProducts === 'function') {
            loadProducts(null, false);
        }
        // Ensure hash then scroll to #home if present, else scroll to top
        try {
            if (window.location.hash !== '#home') {
                window.location.hash = 'home';
            }
            const homeAnchor = document.getElementById('home');
            if (homeAnchor && typeof homeAnchor.scrollIntoView === 'function') {
                homeAnchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        } catch (_) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    } catch (_) {}
}

function showLoginModal() {
    const loginModal = document.getElementById('loginModalOverlay');
    if (loginModal) {
        // Do not show until auth has resolved, or if already logged in
        const hasFirebaseUser = !!(auth && auth.currentUser);
        if (!authResolved || hasFirebaseUser || isLoggedIn) {
            return;
        }
        loginModal.style.display = 'flex';
    }
}

function hideLoginModal() {
    const loginModal = document.getElementById('loginModalOverlay');
    if (loginModal) {
        loginModal.style.display = 'none';
    }
}

// Login Functions
function handleEmailLogin(email, password) {
    if (!auth) {
        showNotification('Firebase not initialized. Please check your configuration.', 'error');
        return;
    }
    if (navigator && navigator.onLine === false) {
        showNotification('You appear to be offline. Please check your internet connection.', 'error');
        return;
    }
    
    if (!email || !password) {
        showNotification('Please enter both email and password', 'error');
        return;
    }
    
    const loginBtn = document.querySelector('#loginForm .login-btn');
    const originalLoginLabel = loginBtn ? loginBtn.innerHTML : '';
    if (loginBtn) { loginBtn.disabled = true; loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...'; }

    auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            // Signed in successfully
            const user = userCredential.user;
            currentUser = user;
            isLoggedIn = true;
            hideLoginModal();
            updateUserInfo(user);
            showNotification(`Welcome back, ${user.email}!`, 'success');
            
            // Save user session
            localStorage.setItem('userEmail', user.email);
            localStorage.setItem('userName', user.displayName || user.email.split('@')[0]);
            localStorage.setItem('isLoggedIn', 'true');

            // Redirect to main/home section after successful login
            try {
                const home = document.querySelector('#home') || document.body;
                (home.scrollIntoView ? home.scrollIntoView({ behavior: 'smooth' }) : null);
            } catch (_) {}
        })
        .catch((error) => {
            if (error && error.code === 'auth/network-request-failed') {
                showNotification('Network error. Please check your connection and try again.', 'error');
                if (loginBtn) { loginBtn.disabled = false; loginBtn.innerHTML = originalLoginLabel; }
                return;
            }
            let errorMessage = 'Login failed';
            
            switch (error.code) {
                case 'auth/invalid-login-credentials':
                    errorMessage = 'Invalid email or password. Please check your credentials or create a new account.';
                    break;
                case 'auth/user-not-found':
                    errorMessage = 'No account found with this email. Please sign up first.';
                    break;
                case 'auth/wrong-password':
                    errorMessage = 'Incorrect password. Please try again.';
                    break;
                case 'auth/invalid-email':
                    errorMessage = 'Please enter a valid email address.';
                    break;
                case 'auth/too-many-requests':
                    errorMessage = 'Too many failed attempts. Please try again later.';
                    break;
                case 'auth/operation-not-supported-in-this-environment':
                    errorMessage = 'Please open this website in a web browser (not file://). Use a local server or deploy online.';
                    break;
                default:
                    errorMessage = `Login failed: ${error.message}`;
            }
            
            showNotification(errorMessage, 'error');
            if (loginBtn) { loginBtn.disabled = false; loginBtn.innerHTML = originalLoginLabel; }
        });
}

function handleGoogleLogin() {
    // Check if Firebase is properly initialized
    if (!auth || !googleProvider) {
        showNotification('Firebase not initialized. Please check your configuration.', 'error');
        return;
    }
    
    // Ensure the account chooser shows
    try { googleProvider.setCustomParameters({ prompt: 'select_account' }); } catch (_) {}
    // Debounce: prevent conflicting popup requests
    if (handleGoogleLogin._busy) { return; }
    handleGoogleLogin._busy = true;
    const btn = document.getElementById('googleSignInBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...'; }
    
    // Prefer popup and fall back to redirect if needed
    auth.signInWithPopup(googleProvider)
        .then((result) => {
            // This gives you a Google Access Token
            const credential = firebase.auth.GoogleAuthProvider.credentialFromResult(result);
            const token = credential.accessToken;
            
            // The signed-in user info
            const user = result.user;
            currentUser = user;
            isLoggedIn = true;
            hideLoginModal();
            updateUserInfo(user);
            showNotification(`Welcome, ${user.displayName}!`, 'success');
            
            // Session is persisted by Firebase; nothing else to do

            // Redirect to main/home section after successful login
            navigateToHome();
        })
        .catch((error) => {
            if (error && error.code === 'auth/cancelled-popup-request') {
                // benign; ignore
                return;
            }
            let errorMessage = 'Google login failed';
            // If user ended up authenticated anyway, do not show an error
            if (auth && auth.currentUser) {
                navigateToHome();
                return;
            }
            
            switch (error.code) {
                case 'auth/cancelled-popup-request':
                    errorMessage = 'Another sign-in is in progress. Please try again.';
                    break;
                case 'auth/operation-not-supported-in-this-environment':
                    errorMessage = 'Please open this website in a web browser (not file://). Use a local server or deploy online.';
                    break;
                case 'auth/popup-closed-by-user':
                    errorMessage = 'Google login was cancelled. Please try again.';
                    break;
                case 'auth/popup-blocked':
                    errorMessage = 'Popup was blocked. Switching to redirect...';
                    try {
                        auth.signInWithRedirect(googleProvider);
                        return;
                    } catch (e) {
                        console.error('Redirect sign-in failed:', e);
                    }
                    break;
                case 'auth/cancelled-popup-request':
                    errorMessage = 'Google login was cancelled. Please try again.';
                    break;
                case 'auth/unauthorized-domain':
                    errorMessage = 'Domain not authorized in Firebase. Add your site domain in Firebase Authentication > Settings > Authorized domains.';
                    break;
                default:
                    errorMessage = `Google login failed: ${error.message}`;
            }
            
            showNotification(errorMessage, 'error');
        })
        .finally(() => {
            handleGoogleLogin._busy = false;
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fab fa-google"></i> Continue with Google'; }
        });
}

function handleSignUp(email, password) {
    // Check if Firebase is properly initialized
    if (!auth) {
        showNotification('Firebase not initialized. Please check your configuration.', 'error');
        return;
    }
    
    // Validate input
    if (!email || !password) {
        showNotification('Please enter both email and password', 'error');
        return;
    }
    
    if (password.length < 6) {
        showNotification('Password must be at least 6 characters long', 'error');
        return;
    }
    
    auth.createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
            // Signed up successfully
            const user = userCredential.user;
            currentUser = user;
            isLoggedIn = true;
            hideLoginModal();
            updateUserInfo(user);
            showNotification(`Account created! Welcome, ${user.email}!`, 'success');
            
            // Save user session
            localStorage.setItem('userEmail', user.email);
            localStorage.setItem('userName', user.displayName || user.email.split('@')[0]);
            localStorage.setItem('isLoggedIn', 'true');
        })
        .catch((error) => {
            console.error('Sign up error:', error);
            let errorMessage = 'Sign up failed';
            
            switch (error.code) {
                case 'auth/email-already-in-use':
                    errorMessage = 'An account with this email already exists. Please sign in instead.';
                    break;
                case 'auth/invalid-email':
                    errorMessage = 'Please enter a valid email address.';
                    break;
                case 'auth/weak-password':
                    errorMessage = 'Password is too weak. Please choose a stronger password.';
                    break;
                case 'auth/operation-not-supported-in-this-environment':
                    errorMessage = 'Please open this website in a web browser (not file://). Use a local server or deploy online.';
                    break;
                default:
                    errorMessage = `Sign up failed: ${error.message}`;
            }
            
            showNotification(errorMessage, 'error');
        });
}

function handleLogout() {
    auth.signOut().then(() => {
        currentUser = null;
        isLoggedIn = false;
        localStorage.removeItem('userEmail');
        localStorage.removeItem('userName');
        localStorage.removeItem('isLoggedIn');
        // Clear local cart to avoid mixing carts across accounts
        cart = [];
        updateCartDisplay();
        saveCartToStorage();
        updateUserInfo(null);
        showNotification('You have been logged out', 'info');
        
        // Optionally show login modal again
        showLoginModal();
    }).catch((error) => {
        showNotification('Logout failed', 'error');
    });
}

function checkLoginStatus() {
    auth.onAuthStateChanged((user) => {
        authInitialized = true;
        if (user) {
            // User is signed in
            currentUser = user;
            isLoggedIn = true;
            hideLoginModal();
            updateUserInfo(user);
            // Load user's Firestore cart and merge strategy: prefer server copy
            loadCartForUser(user.uid);
            // As a safety net, navigate home on first auth resolution when user is logged in
            if (window.location.hash !== '#home') {
                navigateToHome();
            }
        } else {
            // User is signed out
            currentUser = null;
            isLoggedIn = false;
            // Only show after auth resolves
            showLoginModal();
            updateUserInfo(null);
            // On sign-out, keep only local cart (anonymous) to avoid mixing between accounts
            // Optionally clear to avoid cross-account leakage
        }
        authResolved = true;
    });
}

// Account Dropdown Management
function toggleAccountDropdown() {
    const accountDropdown = document.getElementById('accountDropdown');
    const cartDropdown = document.getElementById('cartDropdown');
    
    // Close cart dropdown if open
    cartDropdown.classList.remove('active');
    
    // Toggle account dropdown
    accountDropdown.classList.toggle('active');
}

function updateUserInfo(user) {
    const userNameElement = document.getElementById('userName');
    const userEmailElement = document.getElementById('userEmail');
    const accountBtn = document.getElementById('accountBtn');
    
    if (user) {
        // User is logged in
        userNameElement.textContent = user.displayName || user.email.split('@')[0];
        userEmailElement.textContent = user.email;
        accountBtn.innerHTML = '<i class="fas fa-user-circle"></i>';
        accountBtn.style.color = '#4CAF50'; // Green for logged in
    } else {
        // User is not logged in
        userNameElement.textContent = 'Guest User';
        userEmailElement.textContent = 'Not logged in';
        accountBtn.innerHTML = '<i class="fas fa-user-circle"></i>';
        accountBtn.style.color = 'white'; // Default color
    }

    // Load recent orders into dropdown on hover
    const accountDropdown = document.getElementById('accountDropdown');
    if (accountDropdown) {
        accountDropdown.addEventListener('mouseenter', async () => {
            try {
                const containerId = 'recentOrdersContainer';
                let container = document.getElementById(containerId);
                if (!container) {
                    container = document.createElement('div');
                    container.id = containerId;
                    container.style.padding = '10px 20px';
                    container.style.borderTop = '1px solid #eee';
                    accountDropdown.appendChild(container);
                }
                container.innerHTML = '<div style="color:#666;font-size:0.9rem;">Loading recent orders...</div>';
                if (!ordersCollection || !currentUser) {
                    container.innerHTML = '<div style="color:#666;font-size:0.9rem;">No orders yet.</div>';
                    return;
                }
                const snap = await ordersCollection
                    .where('userId', '==', currentUser.uid)
                    .orderBy('timestamp', 'desc')
                    .limit(3)
                    .get();
                if (snap.empty) {
                    container.innerHTML = '<div style="color:#666;font-size:0.9rem;">No orders yet.</div>';
                    return;
                }
                const items = [];
                snap.forEach(doc => {
                    const d = doc.data();
                    items.push(`<div style=\"display:flex;justify-content:space-between;gap:8px;margin:6px 0;\">`+
                        `<span style=\"color:#333;\">#${doc.id.substring(0,6)}</span>`+
                        `<span style=\"color:#667eea;\">Rs ${d.total || d.totalAmount || 0}</span>`+
                    `</div>`);
                });
                container.innerHTML = '<div style="font-weight:600;margin-bottom:6px;color:#333;">Recent Orders</div>' + items.join('');
            } catch (_) {
                // ignore
            }
        }, { once: true });
    }
}

// Close account dropdown when clicking outside
document.addEventListener('click', function(e) {
    const accountDropdown = document.getElementById('accountDropdown');
    const accountBtn = document.getElementById('accountBtn');
    
    if (!accountDropdown.contains(e.target) && !accountBtn.contains(e.target)) {
        accountDropdown.classList.remove('active');
    }
});

// Sample stationery products
const products = [
    {
        id: 1,
        name: "Premium Ballpoint Pen Set",
        price: 299,
        description: "Set of 5 high-quality ballpoint pens with smooth writing experience",
        image: "https://images.unsplash.com/photo-1586339949916-3e9457bef6d3?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
        category: "pens",
        featured: true
    },
    {
        id: 2,
        name: "A4 Spiral Notebook",
        price: 150,
        description: "200 pages ruled notebook perfect for school and office use",
        image: "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
        category: "notebooks",
        featured: true
    },
    {
        id: 3,
        name: "Mechanical Pencil Set",
        price: 199,
        description: "Professional mechanical pencils with 0.7mm lead and eraser",
        image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
        category: "pencils",
        featured: true
    },
    {
        id: 4,
        name: "Highlighter Pack",
        price: 89,
        description: "Set of 6 vibrant highlighters for marking important text",
        image: "https://images.unsplash.com/photo-1544787219-7f47ccb76574?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
        category: "markers",
        featured: false
    },
    {
        id: 5,
        name: "Sticky Notes Pack",
        price: 45,
        description: "Colorful sticky notes in various sizes for reminders",
        image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
        category: "notes",
        featured: false
    },
    {
        id: 6,
        name: "Eraser Collection",
        price: 75,
        description: "Set of 5 high-quality erasers in different shapes and sizes",
        image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
        category: "erasers",
        featured: false
    },
    {
        id: 7,
        name: "Ruler Set",
        price: 65,
        description: "Transparent rulers in 15cm and 30cm with precise measurements",
        image: "https://images.unsplash.com/photo-1606983340126-99ab4feaa64a?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
        category: "rulers",
        featured: false
    },
    {
        id: 8,
        name: "Correction Tape",
        price: 55,
        description: "White correction tape for neat document corrections",
        image: "https://images.unsplash.com/photo-1586953208448-b95a79798f07?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
        category: "correction",
        featured: false
    },
    {
        id: 9,
        name: "File Folder Set",
        price: 120,
        description: "Set of 10 colorful file folders for organizing documents",
        image: "https://images.unsplash.com/photo-1606983340126-99ab4feaa64a?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
        category: "folders",
        featured: false
    },
    {
        id: 10,
        name: "Pencil Sharpener",
        price: 35,
        description: "Dual-hole pencil sharpener with container for shavings",
        image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
        category: "sharpeners",
        featured: false
    },
    {
        id: 11,
        name: "Colored Pencil Set",
        price: 250,
        description: "Set of 24 high-quality colored pencils for art and design",
        image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
        category: "pencils",
        featured: false
    },
    {
        id: 12,
        name: "Whiteboard Marker Set",
        price: 135,
        description: "Set of 4 whiteboard markers in different colors",
        image: "https://images.unsplash.com/photo-1544787219-7f47ccb76574?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
        category: "markers",
        featured: false
    },
    {
        id: 13,
        name: "Whiteboard Eraser Set",
        price: 135,
        description: "Set of 4 whiteboard erasers in different colors",
        image: "https://images.unsplash.com/photo-1544787219-7f47ccb76574?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
        category: "markers",
        featured: false
    },
    {
        id: 14,
        name: "DOMS Karbon Pencil",
        price: 150,
        description: "It is the box of pencil. Contains 12 pencils.",
        image: "https://domsindia.com/wp-content/uploads/2025/08/208-scaled-1.webp",
        category: "markers",
        featured: true
    }
    ,
    {
        id: 15,
        name: "DOMS Drawings Pencil",
        price: 150,
        description: "It consists of 6 different drawing pencils(HB,2B,4B,6B,8B,10B). ",
        image: "https://www.htconline.in/images/thumbs/0036124_doms-drawing-pencils-sketch-tool-set-of-6_600.jpeg",
        category: "markers",
        featured: true
    }
];

// Theme Management
let isDarkTheme = false;

function toggleTheme() {
    isDarkTheme = !isDarkTheme;
    const themeToggle = document.getElementById('themeToggle');
    const body = document.body;
    
    if (isDarkTheme) {
        body.setAttribute('data-theme', 'dark');
        themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
        localStorage.setItem('theme', 'dark');
    } else {
        body.removeAttribute('data-theme');
        themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
        localStorage.setItem('theme', 'light');
    }
}

function loadTheme() {
    const savedTheme = localStorage.getItem('theme');
    const themeToggle = document.getElementById('themeToggle');
    
    if (savedTheme === 'dark') {
        isDarkTheme = true;
        document.body.setAttribute('data-theme', 'dark');
        themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    }
}

// Initialize the website
document.addEventListener('DOMContentLoaded', function() {
    loadProducts();
    startSlideshow();
    loadCartFromStorage();
    updateCartDisplay();
    loadTheme();
    initMobileMenu();
    initLoginModal();
    checkEnvironment();
    checkLoginStatus();

    // Handle Google redirect result to complete sign-in after fallback
    if (auth && typeof auth.getRedirectResult === 'function') {
        auth.getRedirectResult()
            .then((result) => {
                if (result && result.user) {
                    const user = result.user;
                    currentUser = user;
                    isLoggedIn = true;
                    hideLoginModal();
                    updateUserInfo(user);
                    showNotification(`Welcome, ${user.displayName || 'user'}!`, 'success');
                    navigateToHome();
                }
            })
            .catch((error) => {
                if (error && error.code && error.code !== 'auth/no-auth-event') {
                    console.error('Google redirect error:', error);
                    showNotification('Google sign-in failed. Please try again.', 'error');
                }
            });
    }
});

// Check if running in proper environment
function checkEnvironment() {
    const protocol = window.location.protocol;
    const environmentWarning = document.getElementById('environmentWarning');
    
    if (protocol === 'file:') {
        // Running from file:// - Firebase won't work
        if (environmentWarning) {
            environmentWarning.style.display = 'flex';
        }
        console.warn('Firebase requires HTTP/HTTPS protocol. Please use a local server.');
    } else {
        // Running on HTTP/HTTPS - Firebase should work
        if (environmentWarning) {
            environmentWarning.style.display = 'none';
        }
    }
}

// Initialize Login Modal Event Listeners
function initLoginModal() {
    // Login form submission
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            handleEmailLogin(email, password);
        });
    }
    
    // Google login button
    const googleSignInBtn = document.getElementById('googleSignInBtn');
    if (googleSignInBtn) {
        googleSignInBtn.addEventListener('click', handleGoogleLogin);
    }
    
    // Toggle between Login and Sign Up forms
    const loginFormEl = document.getElementById('loginForm');
    const signupFormEl = document.getElementById('signupForm');
    const googleLoginSection = document.getElementById('googleLoginSection');
    const loginFooter = document.getElementById('loginFooter');
    const signupFooter = document.getElementById('signupFooter');

    function showSignup() {
        if (loginFormEl && signupFormEl) {
            loginFormEl.style.display = 'none';
            signupFormEl.style.display = 'block';
        }
        if (loginFooter && signupFooter) {
            loginFooter.style.display = 'none';
            signupFooter.style.display = 'block';
        }
        if (googleLoginSection) {
            googleLoginSection.style.display = 'none';
        }
    }

    function showLogin() {
        if (loginFormEl && signupFormEl) {
            loginFormEl.style.display = 'block';
            signupFormEl.style.display = 'none';
        }
        if (loginFooter && signupFooter) {
            loginFooter.style.display = 'block';
            signupFooter.style.display = 'none';
        }
        if (googleLoginSection) {
            googleLoginSection.style.display = 'block';
        }
    }

    // Sign up link (switch to sign up form)
    const signUpLink = document.getElementById('signUpLink');
    if (signUpLink) {
        signUpLink.addEventListener('click', function(e) {
            e.preventDefault();
            showSignup();
        });
    }

    // Sign in link (switch back to login form)
    const signInLink = document.getElementById('signInLink');
    if (signInLink) {
        signInLink.addEventListener('click', function(e) {
            e.preventDefault();
            showLogin();
        });
    }

    // Handle Sign Up form submission
    if (signupFormEl) {
        signupFormEl.addEventListener('submit', function(e) {
            e.preventDefault();
            const email = document.getElementById('signupEmail').value;
            const password = document.getElementById('signupPassword').value;
            const confirm = document.getElementById('signupConfirmPassword').value;
            if (!email || !password || !confirm) {
                showNotification('Please fill all fields', 'error');
                return;
            }
            if (password !== confirm) {
                showNotification('Passwords do not match', 'error');
                return;
            }
            handleSignUp(email, password);
        });
    }
    
    // Forgot password link
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', function(e) {
            e.preventDefault();
            
            
            
            const email = document.getElementById('email').value;
            if (email) {
                auth.sendPasswordResetEmail(email)
                    .then(() => {
                        showNotification('Password reset email sent!', 'success');
                    })
                    .catch((error) => {
                        showNotification(`Password reset failed: ${error.message}`, 'error');
                    });
            } else {
                showNotification('Please enter your email address first', 'info');
            }
        });
    }
    
    // Account dropdown menu items
    const logoutLink = document.getElementById('logoutLink');
    if (logoutLink) {
        logoutLink.addEventListener('click', function(e) {
            e.preventDefault();
            handleLogout();
        });
    }
    
    const profileLink = document.getElementById('profileLink');
    if (profileLink) {
        profileLink.addEventListener('click', function(e) {
            e.preventDefault();
            showNotification('Profile page will be available soon!', 'info');
        });
    }
    
    const ordersLink = document.getElementById('ordersLink');
    if (ordersLink) {
        ordersLink.addEventListener('click', function(e) {
            e.preventDefault();
            showNotification('Orders page will be available soon!', 'info');
        });
    }
    
    const settingsLink = document.getElementById('settingsLink');
    if (settingsLink) {
        settingsLink.addEventListener('click', function(e) {
            e.preventDefault();
            showNotification('Settings page will be available soon!', 'info');
        });
    }
    
    // Checkout form submission
    const checkoutForm = document.getElementById('checkoutForm');
    if (checkoutForm) {
        checkoutForm.addEventListener('submit', handlePlaceOrder);
    }
}

// Mobile Menu Functionality
function initMobileMenu() {
    const hamburgerMenu = document.getElementById('hamburgerMenu');
    const navMenu = document.getElementById('navMenu');
    
    if (hamburgerMenu && navMenu) {
        hamburgerMenu.addEventListener('click', function() {
            hamburgerMenu.classList.toggle('active');
            navMenu.classList.toggle('active');
        });
        
        // Close menu when clicking on a link
        const navLinks = navMenu.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', function() {
                hamburgerMenu.classList.remove('active');
                navMenu.classList.remove('active');
            });
        });
        
        // Close menu when clicking outside or on overlay
        document.addEventListener('click', function(e) {
            if (!hamburgerMenu.contains(e.target) && !navMenu.contains(e.target)) {
                hamburgerMenu.classList.remove('active');
                navMenu.classList.remove('active');
            }
        });
        
        // Close menu when clicking on overlay
        navMenu.addEventListener('click', function(e) {
            if (e.target === navMenu) {
                hamburgerMenu.classList.remove('active');
                navMenu.classList.remove('active');
            }
        });
    }
}

// Product Management with Loading Animation
function loadProducts(productsToShow = null, showAll = false) {
    const productsGrid = document.getElementById('productsGrid');
    const noProducts = document.getElementById('noProducts');
    const sectionTitle = document.querySelector('.section-title');
    
    // If no specific products provided, show featured products by default
    if (productsToShow === null) {
        productsToShow = showAll ? products : products.filter(product => product.featured);
    }
    
    // Update section title based on what we're showing
    if (sectionTitle) {
        if (showAll && productsToShow.length > 0) {
            sectionTitle.innerHTML = 'Search Results';
        } else if (!showAll && productsToShow.length > 0) {
            sectionTitle.innerHTML = 'Featured Products';
        } else {
            sectionTitle.innerHTML = 'Our Products';
        }
    }
    
    // Show loading animation briefly
    productsGrid.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading products...</div>';
    
    setTimeout(() => {
        if (productsToShow.length === 0) {
            productsGrid.style.display = 'none';
            noProducts.style.display = 'block';
            return;
        }
        
        productsGrid.style.display = 'grid';
        noProducts.style.display = 'none';
        
        productsGrid.innerHTML = productsToShow.map((product, index) => `
            <div class="product-card" style="animation-delay: ${index * 0.1}s">
                <div class="product-image-container">
                    <img src="${product.image}" alt="${product.name}" class="product-image" onerror="this.src='https://images.unsplash.com/photo-1481627834876-b7833e8f5570?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80'">
                    <div class="product-overlay">
                        <button class="quick-view-btn" onclick="quickView(${product.id})">
                            <i class="fas fa-eye"></i> Quick View
                        </button>
                    </div>
                    ${product.featured ? '<div class="featured-badge"><i class="fas fa-star"></i> Featured</div>' : ''}
                </div>
                <div class="product-info">
                    <h3 class="product-name">${product.name}</h3>
                    <p class="product-description">${product.description}</p>
                    <div class="product-price">Rs ${product.price}</div>
                    <button class="add-to-cart" onclick="addToCart(${product.id})">
                        <i class="fas fa-cart-plus"></i> Add to Cart
                    </button>
                </div>
            </div>
        `).join('');
    }, 150);
}

// Modal functionality
let currentModalProduct = null;

function quickView(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    currentModalProduct = product;
    
    // Update modal content
    document.getElementById('modalImage').src = product.image;
    document.getElementById('modalTitle').textContent = product.name;
    document.getElementById('modalDescription').textContent = product.description;
    document.getElementById('modalPrice').textContent = `Rs ${product.price}`;
    
    // Show modal with animation
    const modal = document.getElementById('modalOverlay');
    modal.style.display = 'flex';
    setTimeout(() => {
        modal.classList.add('active');
    }, 10);
}

function closeModal() {
    const modal = document.getElementById('modalOverlay');
    modal.classList.remove('active');
    
    // Keep the nice closing animation
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
}

function addToCartFromModal() {
    if (currentModalProduct) {
        // Add to cart
        const existingItem = cart.find(item => item.id === currentModalProduct.id);
        
        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            cart.push({
                id: currentModalProduct.id,
                name: currentModalProduct.name,
                price: currentModalProduct.price,
                image: currentModalProduct.image,
                quantity: 1
            });
        }
        
        updateCartDisplay();
        saveCartToStorage();
        if (currentUser) { saveCartForUser(currentUser.uid); }
        
        // Show success message
        showNotification(`✨ ${currentModalProduct.name} added to cart! ✨`, 'success');
        
        closeModal();
    }
}

// Close modal when clicking outside
document.addEventListener('click', function(e) {
    const modal = document.getElementById('modalOverlay');
    if (e.target === modal) {
        closeModal();
    }
});

// Close modal with Escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeModal();
    }
});

// Cart Management
function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const existingItem = cart.find(item => item.id === productId);
    
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            price: product.price,
            image: product.image,
            quantity: 1
        });
    }
    
    updateCartDisplay();
    saveCartToStorage();
    if (currentUser) { saveCartForUser(currentUser.uid); }
    
    // Add visual feedback
    const cartCount = document.getElementById('cartCount');
    cartCount.classList.add('cart-count-pulse');
    setTimeout(() => {
        cartCount.classList.remove('cart-count-pulse');
    }, 300);
    
    // Add bounce effect to the product card
    const productCard = event.target.closest('.product-card');
    productCard.classList.add('product-added');
    setTimeout(() => {
        productCard.classList.remove('product-added');
    }, 350);
    
    // Show success message with enhanced animation
    showNotification(`✨ ${product.name} added to cart! ✨`, 'success');
    
    // Auto-open cart if it's the first item
    if (cart.length === 1) {
        setTimeout(() => {
            toggleCart();
        }, 1000);
    }
}

function removeFromCart(productId) {
    cart = cart.filter(item => item.id !== productId);
    updateCartDisplay();
    saveCartToStorage();
    if (currentUser) { saveCartForUser(currentUser.uid); }
    showNotification('Item removed from cart', 'info');
    
    // Prevent cart from closing when removing items
    event.stopPropagation();
    
}

function updateQuantity(productId, change) {
    const item = cart.find(item => item.id === productId);
    if (!item) return;
    
    item.quantity += change;
    
    if (item.quantity <= 0) {
        removeFromCart(productId);
        return;
    }
    
    updateCartDisplay();
    saveCartToStorage();
    if (currentUser) { saveCartForUser(currentUser.uid); }
    
    // Prevent cart from closing when updating quantity
    event.stopPropagation();
}

function updateCartDisplay() {
    const cartCount = document.getElementById('cartCount');
    const cartItems = document.getElementById('cartItems');
    const cartTotal = document.getElementById('cartTotal');
    
    // Update cart count
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    cartCount.textContent = totalItems;
    
    // Update cart items
    if (cart.length === 0) {
        cartItems.innerHTML = '<p class="empty-cart">Your cart is empty</p>';
    } else {
        cartItems.innerHTML = cart.map(item => `
            <div class="cart-item">
                <img src="${item.image}" alt="${item.name}" onerror="this.src='https://images.unsplash.com/photo-1481627834876-b7833e8f5570?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80'">
                <div class="cart-item-info">
                    <div class="cart-item-name">${item.name}</div>
                    <div class="cart-item-price">Rs ${item.price}</div>
                </div>
                <div class="cart-item-controls">
                    <button class="quantity-btn" onclick="updateQuantity(${item.id}, -1)">-</button>
                    <span>${item.quantity}</span>
                    <button class="quantity-btn" onclick="updateQuantity(${item.id}, 1)">+</button>
                    <button class="remove-item" onclick="removeFromCart(${item.id})">Remove</button>
                </div>
            </div>
        `).join('');
    }
    
    // Update total
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    cartTotal.textContent = total;
}

function toggleCart() {
    const cartDropdown = document.getElementById('cartDropdown');
    cartDropdown.classList.toggle('active');
}

function saveCartToStorage() {
    localStorage.setItem('brihaspatiCart', JSON.stringify(cart));
}

function loadCartFromStorage() {
    const savedCart = localStorage.getItem('brihaspatiCart');
    if (savedCart) {
        cart = JSON.parse(savedCart);
    }
}

// Checkout Functions
function checkout() {
    if (cart.length === 0) {
        showNotification('Your cart is empty!', 'info');
        return;
    }
    
    // Check if user is logged in
    if (!isLoggedIn) {
        showNotification('Please log in to proceed with checkout', 'error');
        showLoginModal();
        return;
    }
    
    showCheckoutModal();
}

function showCheckoutModal() {
    const checkoutModal = document.getElementById('checkoutModalOverlay');
    if (checkoutModal) {
        // Populate checkout items
        updateCheckoutSummary();
        
        // Pre-fill user information if logged in
        if (currentUser) {
            document.getElementById('customerEmail').value = currentUser.email || '';
            document.getElementById('customerName').value = currentUser.displayName || '';
        }
        
        checkoutModal.style.display = 'flex';
    }
}

function closeCheckoutModal() {
    const checkoutModal = document.getElementById('checkoutModalOverlay');
    if (checkoutModal) {
        checkoutModal.style.display = 'none';
    }
}

function updateCheckoutSummary() {
    const checkoutItems = document.getElementById('checkoutItems');
    const checkoutTotal = document.getElementById('checkoutTotal');
    
    if (cart.length === 0) {
        checkoutItems.innerHTML = '<p>No items in cart</p>';
        checkoutTotal.textContent = '0';
        return;
    }
    
    // Display cart items
    checkoutItems.innerHTML = cart.map(item => `
        <div class="checkout-item">
            <img src="${item.image}" alt="${item.name}" onerror="this.src='https://images.unsplash.com/photo-1481627834876-b7833e8f5570?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80'">
            <div class="checkout-item-info">
                <div class="checkout-item-name">${item.name}</div>
                <div class="checkout-item-details">
                    Quantity: ${item.quantity} × Rs ${item.price} = Rs ${item.price * item.quantity}
                </div>
            </div>
        </div>
    `).join('');
    
    // Calculate and display total
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    checkoutTotal.textContent = total;
}

function handlePlaceOrder(event) {
    event.preventDefault();
    
    // Disable button to avoid duplicate submissions
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalLabel = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Placing...'; }

    // Get form data
    const formData = new FormData(event.target);
    const orderData = {
        customerName: formData.get('customerName'),
        customerEmail: formData.get('customerEmail'),
        customerPhone: formData.get('customerPhone'),
        customerCity: formData.get('customerCity'),
        deliveryAddress: formData.get('deliveryAddress'),
        paymentMethod: formData.get('paymentMethod'),
        items: cart.map(item => ({
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            image: item.image
        })),
        total: cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
        totalAmount: cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
        orderDate: new Date().toISOString(),
        estimatedDeliveryDate: (() => {
            const d = new Date();
            d.setDate(d.getDate() + 3);
            return d.toISOString();
        })(),
        status: 'pending',
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        userId: currentUser ? currentUser.uid : null
    };
    
    // Validate form
    if (!validateCheckoutForm(orderData)) {
        return;
    }
    
    // Handle payment method
    if (orderData.paymentMethod === 'online') {
        showNotification('Online payment is under development. Please choose Cash on Delivery.', 'info');
        return;
    }
    
    // Save order to Firebase
    saveOrderToFirebase(orderData);

    // Re-enable after async completes via listeners
}

function validateCheckoutForm(orderData) {
    const requiredFields = ['customerName', 'customerEmail', 'customerPhone', 'customerCity', 'deliveryAddress'];
    
    for (const field of requiredFields) {
        if (!orderData[field] || orderData[field].trim() === '') {
            showNotification(`Please fill in ${field.replace('customer', '').toLowerCase()}`, 'error');
            return false;
        }
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(orderData.customerEmail)) {
        showNotification('Please enter a valid email address', 'error');
        return false;
    }
    
    // Validate phone number (basic validation)
    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(orderData.customerPhone.replace(/\D/g, ''))) {
        showNotification('Please enter a valid 10-digit mobile number', 'error');
        return false;
    }
    
    return true;
}

function saveOrderToFirebase(orderData) {
    ordersCollection.add(orderData)
        .then((docRef) => {
            console.log('Order saved with ID:', docRef.id);
            
            // Clear cart
            cart = [];
            updateCartDisplay();
            saveCartToStorage();
            
            // Close checkout modal
            closeCheckoutModal();
            
            // Show checkout animation instead of immediate success message
            if (typeof showCheckoutAnimation === 'function') {
                showCheckoutAnimation(orderData, docRef.id);
            } else {
                showOrderConfirmation(orderData, docRef.id);
            }
            // Re-enable any disabled submit button on the checkout form
            const form = document.getElementById('checkoutForm');
            if (form) {
                const btn = form.querySelector('button[type="submit"]');
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-shopping-cart"></i> Place Order'; }
            }
        })
        .catch((error) => {
            console.error('Error saving order:', error);
            if (error && error.code === 'failed-precondition') {
                showNotification('You appear to be offline. Please try again when online.', 'error');
            } else {
                showNotification('Failed to place order. Please try again.', 'error');
            }
            const form = document.getElementById('checkoutForm');
            if (form) {
                const btn = form.querySelector('button[type="submit"]');
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-shopping-cart"></i> Place Order'; }
            }
        });
}

function showOrderConfirmation(orderData, orderId) {
    // Show confirmation in a modal instead of alert for better security
    showOrderConfirmationModal(orderData, orderId);
}

// Minimal checkout animation to avoid missing function errors
function showCheckoutAnimation(orderData, orderId) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:5000;';
    const box = document.createElement('div');
    box.style.cssText = 'background:white;border-radius:12px;padding:24px 28px;max-width:420px;width:90%;text-align:center;';
    box.innerHTML = '<div style="font-size:48px;margin-bottom:10px;">✅</div>' +
        '<h3 style="margin:0 0 8px 0;">Order Confirmed</h3>' +
        `<p style="margin:0 0 6px 0;">Order ID: ${orderId}</p>` +
        '<p style="margin:0;color:#666;">We\'ll contact you shortly.</p>';
    overlay.appendChild(box);
    overlay.addEventListener('click', () => overlay.remove());
    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), 4000);
}

function showOrderConfirmationModal(orderData, orderId) {
    // Create a secure confirmation modal
    const modal = document.createElement('div');
    modal.className = 'order-confirmation-modal';
    modal.innerHTML = `
        <div class="confirmation-content">
            <div class="confirmation-header">
                <h2><i class="fas fa-check-circle"></i> Order Confirmed!</h2>
                <button class="confirmation-close" onclick="this.closest('.order-confirmation-modal').remove()">&times;</button>
            </div>
            <div class="confirmation-body">
                <div class="order-details">
                    <h3>Order Details</h3>
                    <p><strong>Order ID:</strong> ${orderId}</p>
                    <p><strong>Customer:</strong> ${orderData.customerName}</p>
                    <p><strong>Email:</strong> ${orderData.customerEmail}</p>
                    <p><strong>Phone:</strong> ${orderData.customerPhone}</p>
                    <p><strong>City:</strong> ${orderData.customerCity}</p>
                    <p><strong>Payment:</strong> ${orderData.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Online Payment'}</p>
                    <p><strong>Total:</strong> Rs ${orderData.total}</p>
                    <p><strong>Estimated Delivery:</strong> ${new Date(orderData.estimatedDeliveryDate).toDateString()}</p>
                    <p><strong>Items:</strong> ${orderData.items.length} item(s)</p>
                </div>
                <div class="confirmation-message">
                    <p><i class="fas fa-info-circle"></i> Thank you for your order! We'll contact you soon for delivery.</p>
                    <p><i class="fas fa-envelope"></i> You will receive a confirmation email shortly.</p>
                </div>
            </div>
        </div>
    `;
    
    // Add styles for the modal
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 4000;
    `;
    
    const content = modal.querySelector('.confirmation-content');
    content.style.cssText = `
        background: white;
        border-radius: 15px;
        max-width: 500px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    `;
    
    const header = modal.querySelector('.confirmation-header');
    header.style.cssText = `
        background: linear-gradient(135deg, #28a745, #20c997);
        color: white;
        padding: 20px;
        border-radius: 15px 15px 0 0;
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;
    
    const body = modal.querySelector('.confirmation-body');
    body.style.cssText = `
        padding: 20px;
    `;
    
    const closeBtn = modal.querySelector('.confirmation-close');
    closeBtn.style.cssText = `
        background: none;
        border: none;
        color: white;
        font-size: 1.5rem;
        cursor: pointer;
    `;
    
    document.body.appendChild(modal);
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
        if (modal.parentNode) {
            modal.remove();
        }
    }, 10000);
}

// Search Functionality
function searchProducts() {
    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput.value.toLowerCase().trim();
    const slideshow = document.querySelector('.slideshow-container');
    const aboutSection = document.querySelector('.about-section');
    
    if (searchTerm === '') {
        // When search is cleared, show only featured products
        loadProducts(null, false);
        slideshow.style.display = 'block';
        if (aboutSection) aboutSection.style.display = 'block';
        return;
    }
    
    // When searching, show ALL products that match the search term
    const filteredProducts = products.filter(product => 
        product.name.toLowerCase().includes(searchTerm) ||
        product.description.toLowerCase().includes(searchTerm) ||
        product.category.toLowerCase().includes(searchTerm)
    );
    
    // Hide slideshow and about section when searching
    slideshow.style.display = 'none';
    if (aboutSection) aboutSection.style.display = 'none';
    
    // Auto-scroll to products section when searching
    const productsSection = document.querySelector('#products');
    if (productsSection) {
        productsSection.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    }
    
    loadProducts(filteredProducts, true);
}

// Enhanced Search with real-time filtering
document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.getElementById('searchInput');
    
    // Real-time search as user types
    searchInput.addEventListener('input', function() {
        clearTimeout(window.searchTimeout);
        window.searchTimeout = setTimeout(() => {
            searchProducts();
        }, 300); // Debounce search
    });
    
    // Search on Enter key
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchProducts();
        }
    });
    
    // Add search icon click functionality
    const searchButton = document.querySelector('.nav-search .search-box button');
    searchButton.addEventListener('click', searchProducts);
});

// Slideshow Functionality
function startSlideshow() {
    slideInterval = setInterval(() => {
        changeSlide(1);
    }, 5000); // Change slide every 5 seconds
}

function changeSlide(direction) {
    const slides = document.querySelectorAll('.slide');
    slides[currentSlide].classList.remove('active');
    
    currentSlide += direction;
    
    if (currentSlide >= slides.length) {
        currentSlide = 0;
    } else if (currentSlide < 0) {
        currentSlide = slides.length - 1;
    }
    
    slides[currentSlide].classList.add('active');
}

// Pause slideshow on hover
document.addEventListener('DOMContentLoaded', function() {
    const slideshow = document.querySelector('.slideshow-container');
    slideshow.addEventListener('mouseenter', () => {
        clearInterval(slideInterval);
    });
    
    slideshow.addEventListener('mouseleave', () => {
        // Keep faster cycle when resuming
        clearInterval(slideInterval);
        slideInterval = setInterval(() => { changeSlide(1); }, 4000);
    });
});

// Notification System
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    
    // Add notification styles
    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        background: ${type === 'success' ? '#27ae60' : '#3498db'};
        color: white;
        padding: 15px 20px;
        border-radius: 5px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 10px;
        animation: slideInRight 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Add CSS animations for notifications and cart
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    
    @keyframes bounceIn {
        0% { transform: scale(0.3); opacity: 0; }
        50% { transform: scale(1.05); }
        70% { transform: scale(0.9); }
        100% { transform: scale(1); opacity: 1; }
    }
    
    @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.1); }
        100% { transform: scale(1); }
    }
    
    .product-added {
        animation: bounceIn 0.35s ease;
    }
    
    .cart-count-pulse {
        animation: pulse 0.3s ease-in-out;
    }
`;
document.head.appendChild(style);

// Smooth scrolling for navigation links
document.addEventListener('DOMContentLoaded', function() {
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            
            if (targetId === '#home') {
                // Clear search and show featured products
                const searchInput = document.getElementById('searchInput');
                if (searchInput) {
                    searchInput.value = '';
                }
                
                // Show slideshow and about section
                const slideshow = document.querySelector('.slideshow-container');
                const aboutSection = document.querySelector('.about-section');
                if (slideshow) slideshow.style.display = 'block';
                if (aboutSection) aboutSection.style.display = 'block';
                
                // Load featured products
                loadProducts(null, false);
                
                // Scroll to top for home
                window.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            } else if (targetId === '#about') {
                // Scroll to about section
                const aboutSection = document.querySelector('#about');
                if (aboutSection) {
                    aboutSection.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            } else {
                const targetSection = document.querySelector(targetId);
                if (targetSection) {
                    targetSection.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            }
        });
    });
});

// Close cart when clicking outside
document.addEventListener('click', function(e) {
    const cartDropdown = document.getElementById('cartDropdown');
    const cartBtn = document.querySelector('.cart-btn');
    
    // Don't close cart if clicking on quantity buttons or cart controls
    if (e.target.classList.contains('quantity-btn') || 
        e.target.classList.contains('remove-item') ||
        e.target.closest('.cart-item-controls')) {
        return;
    }
    
    if (!cartDropdown.contains(e.target) && !cartBtn.contains(e.target)) {
        cartDropdown.classList.remove('active');
    }
});

// Contact Form Firebase Integration
function handleContactFormSubmission(event) {
    event.preventDefault();
    
    // Get form data
    const formData = new FormData(event.target);
    const contactData = {
        name: formData.get('contactName'),
        email: formData.get('contactEmail'),
        message: formData.get('contactMessage'),
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'new',
        userId: currentUser ? currentUser.uid : null
    };
    
    // Validate form data
    if (!validateContactForm(contactData)) {
        return;
    }
    
    // Save to Firebase
    saveContactMessageToFirebase(contactData);
}

function validateContactForm(contactData) {
    // Check required fields
    if (!contactData.name || contactData.name.trim() === '') {
        showNotification('Please enter your name', 'error');
        return false;
    }
    
    if (!contactData.email || contactData.email.trim() === '') {
        showNotification('Please enter your email address', 'error');
        return false;
    }
    
    if (!contactData.message || contactData.message.trim() === '') {
        showNotification('Please enter your message', 'error');
        return false;
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(contactData.email)) {
        showNotification('Please enter a valid email address', 'error');
        return false;
    }
    
    // Check message length
    if (contactData.message.length < 10) {
        showNotification('Please enter a message with at least 10 characters', 'error');
        return false;
    }
    
    return true;
}

function saveContactMessageToFirebase(contactData) {
    try {
        // Show loading state
        const submitButton = document.querySelector('#contactForm button[type="submit"]');
        const originalText = submitButton ? submitButton.textContent : 'Send Message';
        if (submitButton) {
            submitButton.textContent = 'Sending...';
            submitButton.disabled = true;
        }

        if (!db) {
            showNotification('Unable to connect to database. Please try again later.', 'error');
            if (submitButton) {
                submitButton.textContent = originalText;
                submitButton.disabled = false;
            }
            return;
        }

        const targetCollection = contactMessagesCollection || db.collection('contactMessages');
        const fallbackCollection = db.collection('messages');

        const payload = {
            name: contactData.name,
            email: contactData.email,
            message: contactData.message,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'new',
            userId: null
        };

        const trySave = (collectionRef) => collectionRef.add(payload);

        trySave(targetCollection)
            .then((docRef) => {
                showNotification('Thank you for your message! We will get back to you soon.', 'success');
                const form = document.getElementById('contactForm');
                if (form) form.reset();
                if (submitButton) {
                    submitButton.textContent = originalText;
                    submitButton.disabled = false;
                }
            })
            .catch((error) => {
                // Fallback to alternative collection on any failure
                trySave(fallbackCollection)
                    .then(() => {
                        showNotification('Thank you for your message! We will get back to you soon.', 'success');
                        const form = document.getElementById('contactForm');
                        if (form) form.reset();
                        if (submitButton) {
                            submitButton.textContent = originalText;
                            submitButton.disabled = false;
                        }
                    })
                    .catch((altError) => {
                        console.error('Contact message save failed:', error, altError);
                        showNotification('Failed to send message. Please try again later or contact us directly.', 'error');
                        if (submitButton) {
                            submitButton.textContent = originalText;
                            submitButton.disabled = false;
                        }
                    });
            });
    } catch (e) {
        console.error('Unexpected error saving contact message:', e);
        showNotification('Something went wrong. Please try again later.', 'error');
    }
}

// Form submission for contact form
document.addEventListener('DOMContentLoaded', function() {
    const contactForm = document.getElementById('contactForm');
    
    if (contactForm) {
        contactForm.addEventListener('submit', handleContactFormSubmission);
    }
});


// Removed unused Order Page code

// Forgot Password Functionality
function showForgotPassword() {
    const modal = document.getElementById('forgotPasswordModal');
    modal.style.display = 'flex';
    modal.style.animation = 'fadeIn 0.3s ease-out';
}

function closeForgotPassword() {
    const modal = document.getElementById('forgotPasswordModal');
    modal.style.display = 'none';
    
    // Reset form
    document.getElementById('forgotPasswordForm').reset();
    document.getElementById('forgotPasswordSuccess').style.display = 'none';
}

async function handleForgotPassword(event) {
    event.preventDefault();
    
    const email = document.getElementById('resetEmail').value;
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoading = submitBtn.querySelector('.btn-loading');
    const successDiv = document.getElementById('forgotPasswordSuccess');
    
    if (!email) {
        showNotification('Please enter your email address', 'error');
        return;
    }
    
    try {
        // Show loading state
        submitBtn.disabled = true;
        btnText.style.display = 'none';
        btnLoading.style.display = 'inline-flex';
        
        // Send password reset email
        await auth.sendPasswordResetEmail(email);
        
        // Show success message
        successDiv.style.display = 'block';
        successDiv.style.animation = 'fadeInUp 0.6s ease-out';
        
        // Hide form
        event.target.style.display = 'none';
        
        showNotification('Password reset email sent! Check your inbox.', 'success');
        
    } catch (error) {
        console.error('Error sending password reset email:', error);
        showNotification(`Error: ${error.message}`, 'error');
        
        // Reset button state
        submitBtn.disabled = false;
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
    }
}

// Add premium animations to existing elements
function addPremiumAnimations() {
    // Add hover effects to product cards
    const productCards = document.querySelectorAll('.product-card');
    productCards.forEach(card => {
        card.classList.add('card-hover');
    });
    
    // Add button animations
    const buttons = document.querySelectorAll('button, .btn');
    buttons.forEach(btn => {
        btn.classList.add('btn-animated');
    });
    
    // Add input focus animations
    const inputs = document.querySelectorAll('input, textarea');
    inputs.forEach(input => {
        input.classList.add('input-focus');
    });
    
    // Add stagger animation to product grid
    const productItems = document.querySelectorAll('.product-card');
    productItems.forEach((item, index) => {
        item.classList.add('stagger-item');
        item.style.animationDelay = `${index * 0.1}s`;
    });
}

// Initialize everything when page loads
window.addEventListener('load', function() {
    console.log('Brihaspati Stationery website loaded successfully!');
    
    // Add premium animations
    addPremiumAnimations();
    
    // Add forgot password form handler
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener('submit', handleForgotPassword);
    }
    
    // Add forgot password link handler
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', function(e) {
            e.preventDefault();
            showForgotPassword();
        });
    }
});
