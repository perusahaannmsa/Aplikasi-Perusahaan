import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, setDoc, collection, getDocs } from "firebase/firestore";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User,
  signOut
} from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyC1UBvFkyi6vHG9BOiFq2wTMTtkhoYRmMg",
  authDomain: "data-um-nmsa.firebaseapp.com",
  projectId: "data-um-nmsa",
  storageBucket: "data-um-nmsa.firebasestorage.app",
  messagingSenderId: "158324818996",
  appId: "1:158324818996:web:7c58b367b07b255eb8b661"
};

// Initialize Firebase with a dedicated app instance name to prevent conflicts with DEFAULT app
const app = getApps().find(a => a.name === "absenApp") || initializeApp(firebaseConfig, "absenApp");
export const auth = getAuth(app);
export const db = getFirestore(app);

// Setup Google Auth Provider
export const provider = new GoogleAuthProvider();
provider.addScope("https://www.googleapis.com/auth/drive.file");
provider.addScope("https://www.googleapis.com/auth/spreadsheets");

// Flag to track signing in
let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const saveGoogleToken = (token: string, email?: string) => {
  cachedAccessToken = token;
  localStorage.setItem("g_access_token", token);
  localStorage.setItem("g_access_token_time", Date.now().toString());
  if (email) {
    localStorage.setItem("g_user_email", email);
  }
};

export const getFreshGoogleToken = async (forceRefresh = false): Promise<string> => {
  const currentToken = localStorage.getItem("g_access_token");
  const tokenTimeStr = localStorage.getItem("g_access_token_time");
  const tokenAgeMs = tokenTimeStr ? Date.now() - parseInt(tokenTimeStr, 10) : Infinity;

  // Sandbox token bypass
  if (currentToken === "ACCESSTOKEN_SANDBOX_ACTIVE") {
    return currentToken;
  }

  // If token is less than 45 minutes old and forceRefresh is false, return active token
  if (currentToken && tokenAgeMs < 45 * 60 * 1000 && !forceRefresh) {
    return currentToken;
  }

  if (currentToken && !forceRefresh) {
    return currentToken;
  }

  if (currentToken) return currentToken;
  throw new Error("TOKEN_EXPIRED_401: Sesi Google Drive kedaluwarsa. Silakan sambungkan ulang akun Google Anda.");
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      const persistedToken = localStorage.getItem("g_access_token");
      if (persistedToken) {
        cachedAccessToken = persistedToken;
        if (onAuthSuccess) onAuthSuccess(user, persistedToken);
      } else if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      localStorage.removeItem("g_access_token");
      localStorage.removeItem("g_access_token_time");
      localStorage.removeItem("g_user_email");
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (forceSelectAccount = false): Promise<{ user: User; accessToken: string } | null> => {
  if (isSigningIn) {
    console.warn("Proses login Google sedang berjalan...");
    return null;
  }
  try {
    isSigningIn = true;
    const savedEmail = localStorage.getItem("g_user_email");
    if (forceSelectAccount) {
      provider.setCustomParameters({ prompt: "select_account" });
    } else if (savedEmail) {
      provider.setCustomParameters({ login_hint: savedEmail });
    } else {
      provider.setCustomParameters({ prompt: "select_account" });
    }

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("Gagal memperoleh Google Access Token dari autentikasi.");
    }
    saveGoogleToken(credential.accessToken, result.user.email || undefined);
    return { user: result.user, accessToken: credential.accessToken };
  } catch (error: any) {
    console.error("Firebase Sign In with Google failed:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const googleSignOut = async (): Promise<void> => {
  try {
    await signOut(auth);
    cachedAccessToken = null;
    localStorage.removeItem("g_access_token");
    localStorage.removeItem("g_access_token_time");
    localStorage.removeItem("g_user_email");
  } catch (error) {
    console.error("Sign out failed:", error);
    throw error;
  }
};
