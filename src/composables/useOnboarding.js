import { ref, computed, watch } from 'vue';
import { useCurrentUser } from 'vuefire';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useUserData } from './useUserData';

// Step definitions
export const ONBOARDING_STEPS = [
  { id: 'welcome', title: 'Welcome', order: 0 },
  { id: 'spotify', title: 'Connect Spotify', order: 1 },
  { id: 'lastfm', title: 'Connect Last.fm', order: 2 },
  { id: 'choose_setup_method', title: 'Choose Setup Method', order: 2.5 },
  { id: 'create_source', title: 'Create Source Playlist', order: 3 },
  { id: 'add_album', title: 'Add First Album', order: 4 },
  { id: 'create_transient', title: 'Create Transient Playlist', order: 5 },
  { id: 'process_album_source', title: 'Process Album', order: 6 },
  { id: 'listen_heart', title: 'Listen & Heart', order: 7 },
  { id: 'process_album_transient', title: 'Make Decision', order: 8 },
  { id: 'create_more_playlists', title: 'Complete Setup', order: 9 }
];

export function useOnboarding() {
  const user = useCurrentUser();
  const { userData } = useUserData();
  
  const onboardingState = ref(null);
  const loading = ref(true);
  const error = ref(null);

  const currentStep = computed(() => onboardingState.value?.currentStep || 'welcome');
  const completedSteps = computed(() => onboardingState.value?.completedSteps || []);
  const isCompleted = computed(() => onboardingState.value?.completed === true);
  const isSkipped = computed(() => onboardingState.value?.skipped === true);
  const stepData = computed(() => onboardingState.value?.stepData || {});

  // Get step by ID
  const getStepById = (stepId) => {
    return ONBOARDING_STEPS.find(step => step.id === stepId);
  };

  // Get current step index
  const currentStepIndex = computed(() => {
    const step = getStepById(currentStep.value);
    return step ? step.order : 0;
  });

  // Get current step object
  const currentStepObject = computed(() => {
    return getStepById(currentStep.value) || ONBOARDING_STEPS[0];
  });

  // Check if step is completed
  const isStepCompleted = (stepId) => {
    return completedSteps.value.includes(stepId);
  };

  // Get step data
  const getStepData = (key) => {
    return stepData.value[key];
  };

  // Load onboarding state from Firestore
  const loadOnboardingState = async () => {
    if (!user.value) {
      loading.value = false;
      return;
    }

    try {
      loading.value = true;
      error.value = null;
      
      const userDoc = await getDoc(doc(db, 'users', user.value.uid));
      
      if (userDoc.exists()) {
        const data = userDoc.data();
        onboardingState.value = data.onboarding || {
          completed: false,
          currentStep: 'welcome',
          completedSteps: [],
          stepData: {},
          skipped: false
        };
      } else {
        // Initialize onboarding state for new user
        onboardingState.value = {
          completed: false,
          currentStep: 'welcome',
          startedAt: serverTimestamp(),
          completedSteps: [],
          stepData: {},
          skipped: false
        };
      }
    } catch (e) {
      console.error('Error loading onboarding state:', e);
      error.value = 'Failed to load onboarding state';
    } finally {
      loading.value = false;
    }
  };

  // Update current step
  const updateCurrentStep = async (stepId) => {
    if (!user.value) return;

    const step = getStepById(stepId);
    if (!step) {
      console.error('Invalid step ID:', stepId);
      return;
    }

    try {
      await setDoc(doc(db, 'users', user.value.uid), {
        onboarding: {
          ...onboardingState.value,
          currentStep: stepId,
          updatedAt: serverTimestamp()
        }
      }, { merge: true });

      onboardingState.value.currentStep = stepId;
    } catch (e) {
      console.error('Error updating current step:', e);
      throw e;
    }
  };

  // Mark step as completed
  const completeStep = async (stepId, data = {}) => {
    if (!user.value) return;

    const step = getStepById(stepId);
    if (!step) {
      console.error('Invalid step ID:', stepId);
      return;
    }

    try {
      const updatedCompletedSteps = [...completedSteps.value];
      if (!updatedCompletedSteps.includes(stepId)) {
        updatedCompletedSteps.push(stepId);
      }

      const updatedStepData = {
        ...stepData.value,
        ...data
      };

      await setDoc(doc(db, 'users', user.value.uid), {
        onboarding: {
          ...onboardingState.value,
          completedSteps: updatedCompletedSteps,
          stepData: updatedStepData,
          currentStep: stepId,
          updatedAt: serverTimestamp()
        }
      }, { merge: true });

      onboardingState.value.completedSteps = updatedCompletedSteps;
      onboardingState.value.stepData = updatedStepData;
      onboardingState.value.currentStep = stepId;
    } catch (e) {
      console.error('Error completing step:', e);
      throw e;
    }
  };

  // Skip onboarding
  const skipOnboarding = async () => {
    if (!user.value) return;

    try {
      await setDoc(doc(db, 'users', user.value.uid), {
        onboarding: {
          ...onboardingState.value,
          skipped: true,
          skippedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }
      }, { merge: true });

      onboardingState.value.skipped = true;
      onboardingState.value.skippedAt = new Date();
    } catch (e) {
      console.error('Error skipping onboarding:', e);
      throw e;
    }
  };

  // Complete onboarding
  const completeOnboarding = async () => {
    if (!user.value) return;

    try {
      await setDoc(doc(db, 'users', user.value.uid), {
        onboarding: {
          ...onboardingState.value,
          completed: true,
          completedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }
      }, { merge: true });

      onboardingState.value.completed = true;
      onboardingState.value.completedAt = new Date();
    } catch (e) {
      console.error('Error completing onboarding:', e);
      throw e;
    }
  };

  // Initialize onboarding state when user is available
  watch(user, (newUser) => {
    if (newUser) {
      loadOnboardingState();
    } else {
      onboardingState.value = null;
      loading.value = false;
    }
  }, { immediate: true });

  return {
    onboardingState,
    currentStep,
    currentStepIndex,
    currentStepObject,
    completedSteps,
    isCompleted,
    isSkipped,
    stepData,
    loading,
    error,
    loadOnboardingState,
    updateCurrentStep,
    completeStep,
    skipOnboarding,
    completeOnboarding,
    isStepCompleted,
    getStepData,
    getStepById,
    steps: ONBOARDING_STEPS
  };
}

