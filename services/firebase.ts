import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  User 
} from 'firebase/auth';
import { 
  getFirestore,
  initializeFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot,
  getDocFromServer 
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// Using initializeFirestore with experimentalForceLongPolling avoids WebChannel streaming issues in sandboxed iframes and proxy environments
export const db = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Connection test on boot as mandated by SKILL.md
export async function testFirestoreConnection() {
  try {
    if (auth.currentUser) {
      await getDocFromServer(doc(db, 'test', 'connection'));
    }
  } catch (error: any) {
    if (error instanceof Error && (error.message.includes('offline') || error.message.includes('unavailable') || (error as any)?.code === 'unavailable')) {
      console.warn("Firestore operating in offline/delayed sync mode.");
    }
  }
}
if (typeof window !== 'undefined') {
  setTimeout(() => {
    testFirestoreConnection();
  }, 1000);
}

export interface UserCloudProfile {
  id: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  userGoal?: string;
  trainingMethodology?: 'polarized' | 'pyramidal' | 'norwegian';
  trainingMode?: 'cycling' | 'triathlon' | 'running';
  planMode?: 'power' | 'hr';
  ftp?: number;
  planContext?: string;
  chatHistoryJson?: string;
  intervalsApiKey?: string;
  intervalsAthleteId?: string;
  weeklyBriefingJson?: string;
  generatedWeeksJson?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Auth Helpers
export async function loginWithGoogle(): Promise<User> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Google sign-in error:", error);
    throw error;
  }
}

export async function logoutUser(): Promise<void> {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Logout error:", error);
    throw error;
  }
}

export function subscribeAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

// User Profile & Preferences Sync
export async function fetchUserCloudProfile(userId: string): Promise<UserCloudProfile | null> {
  const path = `users/${userId}`;
  try {
    const snapshot = await getDoc(doc(db, 'users', userId));
    if (snapshot.exists()) {
      return snapshot.data() as UserCloudProfile;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function saveUserCloudProfile(userId: string, data: Partial<UserCloudProfile>): Promise<void> {
  const path = `users/${userId}`;
  try {
    const cleanData: Record<string, any> = {
      id: userId,
      email: auth.currentUser?.email || '',
      updatedAt: new Date().toISOString()
    };

    if (data.displayName !== undefined) cleanData.displayName = data.displayName;
    if (data.photoURL !== undefined) cleanData.photoURL = data.photoURL;
    if (data.userGoal !== undefined) cleanData.userGoal = data.userGoal;
    if (data.trainingMethodology !== undefined) cleanData.trainingMethodology = data.trainingMethodology;
    if (data.trainingMode !== undefined) cleanData.trainingMode = data.trainingMode;
    if (data.planMode !== undefined) cleanData.planMode = data.planMode;
    if (data.ftp !== undefined && data.ftp !== null) cleanData.ftp = Number(data.ftp);
    if (data.planContext !== undefined) cleanData.planContext = data.planContext;
    if (data.chatHistoryJson !== undefined) cleanData.chatHistoryJson = data.chatHistoryJson;
    if (data.intervalsApiKey !== undefined) cleanData.intervalsApiKey = data.intervalsApiKey;
    if (data.intervalsAthleteId !== undefined) cleanData.intervalsAthleteId = data.intervalsAthleteId;
    if (data.weeklyBriefingJson !== undefined) cleanData.weeklyBriefingJson = data.weeklyBriefingJson;
    if (data.generatedWeeksJson !== undefined) cleanData.generatedWeeksJson = data.generatedWeeksJson;
    if (data.createdAt !== undefined) cleanData.createdAt = data.createdAt;

    await setDoc(doc(db, 'users', userId), cleanData, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeUserCloudProfile(userId: string, callback: (profile: UserCloudProfile | null) => void) {
  const path = `users/${userId}`;
  return onSnapshot(
    doc(db, 'users', userId),
    (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.data() as UserCloudProfile);
      } else {
        callback(null);
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}
