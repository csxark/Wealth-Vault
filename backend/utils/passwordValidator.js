import zxcvbn from 'zxcvbn';

/**
 * Validate password strength using zxcvbn
 * @param {string} password - Password to validate
 * @param {Array} userInputs - Additional inputs to check against (email, name, etc.)
 * @returns {Object} Validation result with success, score, feedback, and message
 */
export const validatePasswordStrength = (password, userInputs = []) => {
  // Minimum password length
  const MIN_LENGTH = 8;
  
  // Check minimum length
  if (!password || password.length < MIN_LENGTH) {
    return {
      success: false,
      score: 0,
      message: `Password must be at least ${MIN_LENGTH} characters long`,
      feedback: {
        suggestions: [`Use at least ${MIN_LENGTH} characters`]
      }
    };
  }
  
  // Use zxcvbn to evaluate password strength
  // Score ranges from 0-4 (0: too weak, 1: weak, 2: fair, 3: good, 4: strong)
  const result = zxcvbn(password, userInputs);
  
  // Require minimum score of 2 (fair)
  const MIN_SCORE = 2;
  
  if (result.score < MIN_SCORE) {
    const suggestions = result.feedback.suggestions.length > 0 
      ? result.feedback.suggestions 
      : ['Use a mix of letters, numbers, and symbols', 'Avoid common words and patterns'];
    
    return {
      success: false,
      score: result.score,
      message: 'Password is too weak. Please choose a stronger password.',
      feedback: {
        warning: result.feedback.warning || 'This password is easily guessable',
        suggestions: suggestions
      }
    };
  }
  
  // Password is strong enough
  return {
    success: true,
    score: result.score,
    message: 'Password is strong',
    feedback: {
      suggestions: result.feedback.suggestions
    }
  };
};

/**
 * Get password strength description
 * @param {number} score - Password strength score (0-4)
 * @returns {string} Description of password strength
 */
export const getPasswordStrengthDescription = (score) => {
  const descriptions = {
    0: 'Very Weak',
    1: 'Weak',
    2: 'Fair',
    3: 'Good',
    4: 'Strong'
  };
  
  return descriptions[score] || 'Unknown';
};

/**
 * Common password patterns to block
 */
const COMMON_PASSWORDS = [
  'password', 'Password123', '12345678', 'qwerty', 'abc123', 
  'password1', '123456789', '12345', '1234567', 'password123',
  'admin', 'letmein', 'welcome', 'monkey', '1234567890'
];

/**
 * Check if password is in common password list
 * @param {string} password - Password to check
 * @returns {boolean} True if password is common
 */
export const isCommonPassword = (password) => {
  return COMMON_PASSWORDS.some(common => 
    password.toLowerCase() === common.toLowerCase()
  );
};
