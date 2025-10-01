/*
===========================================
SECURE FIREBASE CONFIGURATION
===========================================

IMPORTANT SECURITY NOTES:
1. This file contains sensitive Firebase configuration
2. NEVER commit this file to GitHub with real API keys
3. Use environment variables for production
4. For GitHub Pages, use Firebase Hosting instead

FOR GITHUB PAGES DEPLOYMENT:
1. Use Firebase Hosting (recommended)
2. Or use environment variables with a build process
3. Or use Firebase's public configuration (less secure but works)

CURRENT SETUP FOR DEVELOPMENT:
- This config is safe for development
- For production, move to Firebase Hosting
- Or use environment variables

===========================================
*/

// Scope everything to avoid leaking globals
(function() {
  // Firebase Configuration (scoped)
  const cfg = {
  apiKey: "AIzaSyC5EvGkQRIj2XSyyavy2kSeFp1fP1TAjMQ",
  authDomain: "brihaspati-9d437.firebaseapp.com",
  projectId: "brihaspati-9d437",
  storageBucket: "brihaspati-9d437.appspot.com",
  messagingSenderId: "596207768871",
  appId: "1:596207768871:web:2fe9277b73291cf9c38502"
  };

  // Initialize Firebase (idempotent)
  if (!firebase.apps || firebase.apps.length === 0) {
    firebase.initializeApp(cfg);
  }

  // Initialize Firebase services (scoped)
  const auth = firebase.auth();
  const db = firebase.firestore();
  const googleProvider = new firebase.auth.GoogleAuthProvider();
  const ordersCollection = db.collection('orders');
  const contactMessagesCollection = db.collection('contactMessages');

  // Ensure auth persistence (records sessions reliably)
  try {
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
  } catch (_) {}

  // Export for use in main script (single namespaced object)
  window.firebaseServices = {
    auth: auth,
    db: db,
    googleProvider: googleProvider,
    ordersCollection: ordersCollection,
    contactMessagesCollection: contactMessagesCollection
  };
})();
