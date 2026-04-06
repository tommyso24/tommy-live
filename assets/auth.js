/**
 * assets/auth.js
 * Global authentication state management for Tommy.live
 */
(function() {
  const TOKEN_KEY = 'tommy_token';
  const USER_KEY = 'tommy_user';

  window.TommyAuth = {
    /**
     * Get token from localStorage
     * @returns {string|null}
     */
    getToken() {
      return localStorage.getItem(TOKEN_KEY);
    },

    /**
     * Get user object from localStorage
     * @returns {Object|null}
     */
    getUser() {
      const user = localStorage.getItem(USER_KEY);
      try {
        return user ? JSON.parse(user) : null;
      } catch (e) {
        console.error('Failed to parse user from localStorage', e);
        return null;
      }
    },

    /**
     * Save token and user to localStorage
     * @param {string} token 
     * @param {Object} user 
     */
    save(token, user) {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    },

    /**
     * Clear token and user from localStorage
     */
    clear() {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    },

    /**
     * Check if user is logged in (has token)
     * @returns {boolean}
     */
    isLoggedIn() {
      return !!this.getToken();
    },

    /**
     * Wrapper for fetch that automatically adds Authorization header
     * @param {string} url 
     * @param {Object} options 
     * @returns {Promise<Response>}
     */
    async fetchWithAuth(url, options = {}) {
      const token = this.getToken();
      const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      return fetch(url, { ...options, headers });
    },

    /**
     * Verify token validity via API
     * @returns {Promise<boolean>}
     */
    async check() {
      if (!this.isLoggedIn()) return false;
      
      try {
        const resp = await this.fetchWithAuth('/api/auth/me');
        if (resp.ok) {
          const data = await resp.json();
          if (data.user) {
            this.save(this.getToken(), data.user);
          }
          return true;
        } else {
          this.clear();
          return false;
        }
      } catch (e) {
        console.error('Auth check failed', e);
        this.clear();
        return false;
      }
    }
  };
})();
