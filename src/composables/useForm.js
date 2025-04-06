import { ref, reactive } from 'vue';

export function useForm(initialState = {}) {
  const form = reactive({ ...initialState });
  const isSubmitting = ref(false);
  const error = ref(null);
  const success = ref(false);

  const resetForm = () => {
    Object.keys(form).forEach(key => {
      form[key] = initialState[key] || '';
    });
    error.value = null;
    success.value = false;
  };

  const handleSubmit = async (submitFn) => {
    isSubmitting.value = true;
    error.value = null;
    success.value = false;

    try {
      await submitFn(form);
      success.value = true;
    } catch (err) {
      console.error('Form submission error:', err);
      error.value = err.message || 'Failed to submit form. Please try again.';
    } finally {
      isSubmitting.value = false;
    }
  };

  const validateForm = (validationRules) => {
    const errors = {};
    
    Object.keys(validationRules).forEach(field => {
      const rules = validationRules[field];
      const value = form[field];

      if (rules.required && !value) {
        errors[field] = `${field} is required`;
      }

      if (rules.minLength && value.length < rules.minLength) {
        errors[field] = `${field} must be at least ${rules.minLength} characters`;
      }

      if (rules.maxLength && value.length > rules.maxLength) {
        errors[field] = `${field} must be no more than ${rules.maxLength} characters`;
      }

      if (rules.pattern && !rules.pattern.test(value)) {
        errors[field] = `${field} is invalid`;
      }
    });

    return Object.keys(errors).length === 0 ? null : errors;
  };

  return {
    form,
    isSubmitting,
    error,
    success,
    resetForm,
    handleSubmit,
    validateForm
  };
} 